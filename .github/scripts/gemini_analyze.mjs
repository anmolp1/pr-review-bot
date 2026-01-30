// .github/scripts/gemini_analyze.mjs
import fs from "node:fs";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_REVIEW_API_KEY || process.env.GEMINI_API_KEY });
const PRIMARY_MODEL = process.env.GEMINI_PRIMARY_MODEL || "gemini-2.5-flash";
// Use a distinct fallback by default for resilience if the primary is rate-limited or unavailable.
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-2.0-flash";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryable(err) {
  const status = err?.status ?? err?.response?.status;
  return status === 429 || status === 503 || status === 500;
}

async function withRetry(fn, {
  maxAttempts = 6,
  baseDelayMs = 1500,
  maxDelayMs = 20000,
} = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;

      if (!isRetryable(err) || attempt === maxAttempts) break;

      // exponential backoff + jitter
      const exp = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1));
      const jitter = Math.floor(Math.random() * 700);
      const wait = exp + jitter;

      console.log(`Gemini call failed (attempt ${attempt}/${maxAttempts}) status=${err?.status}. Retrying in ${wait}ms...`);
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

function loadContext() {
  return fs.existsSync(".github/gemini_context.md")
    ? fs.readFileSync(".github/gemini_context.md", "utf8")
    : "";
}

// Hard cap to reduce token blowups (tune if needed)
function capString(s, maxChars) {
  if (!s) return "";
  return s.length > maxChars ? s.slice(0, maxChars) + "\n...(truncated)\n" : s;
}

function extractFirstJsonObject(text) {
  if (!text) return null;

  // Remove common markdown fences if present
  const unfenced = text.replace(/```json\s*/gi, "").replace(/```/g, "");

  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  const candidate = unfenced.slice(start, end + 1);
  try {
    JSON.parse(candidate);
    return candidate;
  } catch {
    return null;
  }
}

function buildFallbackFindings(summaryLines) {
  return JSON.stringify(
    {
      blockers: [],
      important: [],
      suggestions: [],
      test_gaps: [],
      security: [],
      performance: [],
      reliability: [],
      summary: summaryLines,
    },
    null,
    2
  );
}

async function main() {
  // If size guardrail tripped, skip Gemini gracefully
  if (fs.existsSync("STOP_REVIEW.txt")) {
    console.log("STOP_REVIEW.txt present; skipping Gemini analyze.");
    fs.writeFileSync("gemini_findings.json", JSON.stringify({
      blockers: [],
      important: [],
      suggestions: [],
      test_gaps: [],
      security: [],
      performance: [],
      reliability: [],
      summary: [
        "PR is too large for a reliable automated LLM review.",
        "Please split the PR into smaller chunks (or ensure patches are available)."
      ]
    }, null, 2));
    return;
  }

  const context = loadContext();
  const bundleRaw = fs.readFileSync("review_bundle.json", "utf8");

  // Cap the raw bundle size sent to the model (prevents huge prompts)
  const bundleCapped = capString(bundleRaw, 80000); // ~80k chars cap

  const prompt = `
You are a senior engineer reviewing a PR.

Principles:
- Be HIGH SIGNAL. If something is a nit, label it as NIT and keep it short.
- Prefer actionable, concrete findings over general advice.
- Do NOT comment on formatting that linters/formatters would catch.
- Base your review ONLY on the PR bundle + description + diffs below.
- If context is missing, state it as a hypothesis.

Return ONLY valid JSON with this schema:
{
  "blockers": [{"title": "...", "details": "...", "files": ["..."], "suggested_fix": "..."}],
  "important": [{"title": "...", "details": "...", "files": ["..."], "suggested_fix": "..."}],
  "suggestions": [{"title": "...", "details": "...", "files": ["..."], "suggested_fix": "..."}],
  "test_gaps": [{"title": "...", "details": "...", "files": ["..."], "suggested_test": "..."}],
  "security": [{"severity": "BLOCKER|IMPORTANT|SUGGESTION", "title": "...", "details": "...", "files": ["..."], "suggested_fix": "..."}],
  "performance": [{"severity": "BLOCKER|IMPORTANT|SUGGESTION", "title": "...", "details": "...", "files": ["..."], "suggested_fix": "..."}],
  "reliability": [{"severity": "BLOCKER|IMPORTANT|SUGGESTION", "title": "...", "details": "...", "files": ["..."], "suggested_fix": "..."}],
  "summary": ["...","...","..."]
}

Repo context:
${context}

PR bundle (JSON):
${bundleCapped}
`;

  const resp = await generateWithFallback({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  });

  fs.writeFileSync("gemini_analyze_raw.txt", (resp.text || ""), "utf8");

  const rawText = resp.text || "";
  let jsonText = rawText.trim();

  // Salvage JSON if the model wrapped it in text or markdown fences
  if (!jsonText.startsWith("{")) {
    const salvaged = extractFirstJsonObject(jsonText);
    if (salvaged) {
      console.log("Salvaged JSON from Gemini output.");
      jsonText = salvaged;
    }
  }

  try {
    JSON.parse(jsonText);
    fs.writeFileSync("gemini_findings.json", jsonText, "utf8");
    console.log("Wrote gemini_findings.json (parsed)");
    return;
  } catch {
    console.log("Gemini output not parseable JSON, writing fallback.");
    const fallbackJson = buildFallbackFindings([
      "Gemini returned output that could not be parsed as JSON.",
      "Check gemini_analyze_raw.txt in the workflow artifacts/logs.",
    ]);
    fs.writeFileSync("gemini_findings.json", fallbackJson, "utf8");
    return;
  }
}

main().catch((err) => {
  console.error("Gemini analyze failed:", {
    status: err?.status,
    message: err?.message,
    details: err?.response?.data || err?.error,
  });
  // Write a graceful fallback so the workflow can still post something
  fs.writeFileSync(
    "gemini_findings.json",
    buildFallbackFindings([
      "Gemini analyze failed (likely rate limit / quota).",
      "Retry logic exhausted. Consider lowering request size or adding model routing.",
    ]),
    "utf8"
  );
  // Exit 0 so the job can continue and post a review explaining the failure.
  process.exit(0);
});
