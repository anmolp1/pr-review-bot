import fs from "node:fs";
import { Octokit } from "@octokit/rest";

const [owner, repo] = process.env.REPO.split("/");
const pull_number = Number(process.env.PR_NUMBER);

if (!fs.existsSync("gemini_findings.json")) {
  console.log("No findings JSON; skipping inline comments.");
  process.exit(0);
}

let findings;
try {
  findings = JSON.parse(fs.readFileSync("gemini_findings.json", "utf8"));
} catch {
  console.log("Findings not valid JSON; skipping inline comments.");
  process.exit(0);
}

const blockers = Array.isArray(findings.blockers) ? findings.blockers : [];
if (blockers.length === 0) {
  console.log("No blockers; skipping inline comments.");
  process.exit(0);
}

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

// We need PR head SHA for review comments
const pr = await octokit.pulls.get({ owner, repo, pull_number });
const commit_id = pr.data.head.sha;

// Minimal inline comments: use a PR review with comments is more involved;
// simplest is to add a regular PR comment referencing files.
const top = blockers.slice(0, 5).map((b, i) => {
  const files = (b.files || []).slice(0, 5).join(", ");
  return `**BLOCKER ${i + 1}: ${b.title}**\n- Files: ${files || "(unspecified)"}\n- ${b.details}\n- Suggested fix: ${b.suggested_fix}\n`;
}).join("\n---\n\n");

await octokit.issues.createComment({
  owner, repo,
  issue_number: pull_number,
  body: `### 🚨 Blocker highlights (quick)\n\n${top}`,
});

console.log("Posted blocker highlights comment.");
