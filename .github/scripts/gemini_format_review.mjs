import fs from "node:fs";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_REVIEW_API_KEY || process.env.GEMINI_API_KEY });
const PRIMARY_MODEL = process.env.GEMINI_PRIMARY_MODEL || "gemini-2.5-flash";
// Use a distinct fallback by default for resilience if the primary is rate-limited or unavailable.
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-2.0-flash";

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function isRetryable(err) {
  const status = err?.status ?? err?.response?.status;
  return status === 429 || status === 503 || status === 500;
}

async function withRetry(fn, { maxAttempts = 6, baseDelayMs = 1500, maxDelayMs = 20000 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try { return await fn(); }
    catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === maxAttempts) break;
      const exp = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1));
      const jitter = Math.floor(Math.random() * 700);
      const wait = exp + jitter;
      console.log(`Gemini format failed (attempt ${attempt}/${maxAttempts}) status=${err?.status}. Retrying in ${wait}ms...`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

async function generateWithFallback(request) {
  try {
    return await withRetry(() =>
      ai.models.generateContent({ ...request, model: PRIMARY_MODEL })
    );
  } catch (err) {
    const status = err?.status ?? err?.response?.status;
    if (status !== 429) throw err;
    console.log(`Primary model rate limited (${PRIMARY_MODEL}). Falling back to ${FALLBACK_MODEL}...`);
    return await withRetry(() =>
      ai.models.generateContent({ ...request, model: FALLBACK_MODEL })
    );
  }
}

function fallbackReview(reason) {
  let prTitle = "(unknown)";
  let headSha = "(unknown)";
  let coverageNotes = "";
  try {
    const bundle = JSON.parse(fs.readFileSync("review_bundle.json", "utf8"));
    prTitle = bundle?.pr?.title || prTitle;
    headSha = bundle?.pr?.headSha || headSha;
    coverageNotes = buildCoverageNotes(bundle);
  } catch {}

  let findings = null;
  try { findings = JSON.parse(fs.readFileSync("gemini_findings.json", "utf8")); } catch {}

  const summaryLines = findings?.summary?.length ? findings.summary : [
    reason,
    "No formatted Gemini review was produced."
  ];

  const recommendation = buildMergeRecommendation(findings);

  return `# Gemini PR Review (v2)

**PR:** ${prTitle}  
**Head SHA:** ${headSha}

## 🚨 Blockers
- None (format step failed; this is a fallback review)

## ✅ Summary
${summaryLines.map(s => `- ${s}`).join("\n")}

${coverageNotes}

## ✅ Merge Recommendation
${recommendation}

## Next steps
- Re-run the workflow (Gemini may have hit rate limits).
- If this happens frequently, reduce PR diff size or add repo-wide concurrency for Gemini steps.
`;
}

function buildMergeRecommendation(findings) {
  const blockers = findings?.blockers?.length || 0;
  const important = findings?.important?.length || 0;
  const security = (findings?.security || []).filter(item => item?.severity !== 'SUGGESTION').length;
  const performance = (findings?.performance || []).filter(item => item?.severity !== 'SUGGESTION').length;
  const reliability = (findings?.reliability || []).filter(item => item?.severity !== 'SUGGESTION').length;

  if (blockers > 0) {
    return `❌ Do not merge. Blockers found (${blockers}).`;
  }

  const importantSignals = important + security + performance + reliability;
  if (importantSignals > 0) {
    return `⚠️ Needs changes before merge. Important findings (${importantSignals}).`;
  }

  return `✅ Safe to merge. No blockers or important findings.`;
}

function buildCoverageNotes(bundle) {
  const missing = bundle?.stats?.patch_missing_files || [];
  if (!missing.length) return "";

  const maxList = 20;
  const listed = missing.slice(0, maxList);
  const extra = missing.length - listed.length;
  const lines = listed.map((file) => `- ${file}`).join("\n");
  const more = extra > 0 ? `\n- ...(and ${extra} more)` : "";

  return `## 📦 Coverage Notes
Some files were too large or binary and did not include patches in the PR bundle:
${lines}${more}
`;
}

function insertBeforeMergeRecommendation(body, insert) {
  if (!insert) return body;
  const marker = /##\s*✅\s*Merge Recommendation/i;
  if (!marker.test(body)) {
    return `${body}\n\n${insert}`;
  }
  return body.replace(marker, `${insert}\n\n$&`);
}

async function main() {
  // If STOP_REVIEW exists, write a size-based review and exit
  if (fs.existsSync("STOP_REVIEW.txt")) {
    fs.writeFileSync("review_final.md", fallbackReview("PR too large for reliable automated review. Please split it."), "utf8");
    console.log("Wrote fallback review_final.md due to STOP_REVIEW.txt");
    return;
  }

  // Ensure we have something to format
  if (!fs.existsSync("gemini_findings.json")) {
    fs.writeFileSync("review_final.md", fallbackReview("Missing gemini_findings.json."), "utf8");
    console.log("Wrote fallback review_final.md due to missing gemini_findings.json");
    return;
  }

  const findingsRaw = fs.readFileSync("gemini_findings.json", "utf8");
  const bundle = JSON.parse(fs.readFileSync("review_bundle.json", "utf8"));

  const prompt = `
Convert the findings JSON into a concise PR review in Markdown.

Rules:
- Start with "## 🚨 Blockers" (or "None found")
- Then "## ✅ Important"
- Then "## 🧪 Tests to add"
- Then "## 🔐 Security / Privacy"
- Then "## ⚡ Performance"
- Then "## 🧯 Reliability / Ops"
- Then "## 📝 Suggestions" (short)
- End with "## ✅ Merge Recommendation" and one line: ✅ Safe to merge / ⚠️ Needs changes / ❌ Do not merge.

Every bullet should mention file names when available.
No long essays. Keep it skimmable.

PR title: ${bundle.pr.title}
Head SHA: ${bundle.pr.headSha}

Findings JSON:
${findingsRaw}
`;

  const resp = await generateWithFallback({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  const out = (resp.text || "").trim();
  if (!out) {
    fs.writeFileSync("review_final.md", fallbackReview("Gemini returned empty formatted review."), "utf8");
    console.log("Wrote fallback review_final.md due to empty Gemini output");
    return;
  }

  const coverageNotes = buildCoverageNotes(bundle);
  const recommendation = buildMergeRecommendation(JSON.parse(findingsRaw));
  const withCoverage = insertBeforeMergeRecommendation(out, coverageNotes.trim());
  const hasRecommendation = /##\s*✅\s*Merge Recommendation/i.test(withCoverage);
  const finalOut = hasRecommendation
    ? withCoverage
    : `${withCoverage}\n\n## ✅ Merge Recommendation\n${recommendation}`;

  fs.writeFileSync("review_final.md", finalOut + "\n", "utf8");
  console.log("Wrote review_final.md");
}

main().catch((err) => {
  console.error("Gemini format failed:", err?.message || err);
  fs.writeFileSync("review_final.md", fallbackReview("Gemini format failed (rate limit/quota or transient error)."), "utf8");
  console.log("Wrote fallback review_final.md after format failure");
  process.exit(0); // don't fail the job
});
