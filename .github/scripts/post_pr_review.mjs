import fs from "node:fs";
import { Octokit } from "@octokit/rest";

const [owner, repo] = process.env.REPO.split("/");
const pull_number = Number(process.env.PR_NUMBER);

function safeRead(path) {
  try { return fs.readFileSync(path, "utf8"); } catch { return null; }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryable(err) {
  const status = err?.status ?? err?.response?.status;
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

async function withRetry(fn, {
  maxAttempts = 4,
  baseDelayMs = 1000,
  maxDelayMs = 8000
} = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === maxAttempts) break;
      const exp = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1));
      const jitter = Math.floor(Math.random() * 500);
      const wait = exp + jitter;
      console.log(`PR review post failed (attempt ${attempt}/${maxAttempts}) status=${err?.status}. Retrying in ${wait}ms...`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

function fallbackBody() {
  let bundle = null;
  try { bundle = JSON.parse(fs.readFileSync("review_bundle.json", "utf8")); } catch {}

  const title = bundle?.pr?.title || "(unknown PR title)";
  const sha = bundle?.pr?.headSha || "(unknown sha)";

  const findings = safeRead("gemini_findings.json");
  return `# Gemini PR Review (fallback)

**PR:** ${title}  
**Head SHA:** ${sha}

Gemini did not produce a formatted review file (\`review_final.md\` missing).  
This usually happens due to rate limits/quota or earlier step failures.

## What you can do
- Re-run the workflow.
- Reduce PR size if diffs are large.
- Enable repo-wide concurrency for the Gemini steps.

Raw findings JSON present: **${findings ? "Yes" : "No"}**
`;
}

async function main() {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

  const body = safeRead("review_final.md") || fallbackBody();

  const maxChars = 60000;
  const finalBody = body.length > maxChars
    ? body.slice(0, maxChars) + "\n\n_(Truncated due to size.)_"
    : body;

  try {
    await withRetry(() => octokit.pulls.createReview({
      owner, repo, pull_number,
      event: "COMMENT",
      body: finalBody,
    }));
    console.log("Posted PR review.");
    return;
  } catch (err) {
    console.warn("Failed to post PR review. Falling back to issue comment.", err?.status || err?.message || err);
  }

  try {
    await withRetry(() => octokit.issues.createComment({
      owner, repo,
      issue_number: pull_number,
      body: finalBody
    }));
    console.log("Posted PR review as issue comment.");
  } catch (err) {
    console.error("Failed to post issue comment:", err?.status || err?.message || err);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
