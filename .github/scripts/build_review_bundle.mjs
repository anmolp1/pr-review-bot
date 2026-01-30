import { Octokit } from "@octokit/rest";
import fs from "node:fs";

const [owner, repo] = process.env.REPO.split("/");
const pull_number = Number(process.env.PR_NUMBER);

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

function trimPatch(patch, maxChars = 12000) {
  if (!patch) return "";
  return patch.length > maxChars ? patch.slice(0, maxChars) + "\n…(truncated)" : patch;
}

function isBinaryOrLargeNoPatch(f) {
  // GitHub may omit patch for large diffs/binaries.
  return !f.patch;
}

async function main() {
  const pr = await octokit.pulls.get({ owner, repo, pull_number });
  const files = await octokit.paginate(
    octokit.pulls.listFiles,
    { owner, repo, pull_number, per_page: 100 },
    (res) => res.data
  );

  // Basic filtering: adjust to your repo.
  const filtered = files
    .filter(f => f.status !== "removed")
    .filter(f => !f.filename.endsWith(".lock"))
    .filter(f => !f.filename.match(/\.(png|jpg|jpeg|gif|pdf)$/i));

  const items = filtered.slice(0, 80).map(f => ({
    filename: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    changes: f.changes,
    patch: trimPatch(f.patch),
    patch_missing: isBinaryOrLargeNoPatch(f),
  }));

  const bundle = {
    pr: {
      title: pr.data.title,
      body: pr.data.body || "",
      user: pr.data.user?.login,
      base: pr.data.base?.ref,
      head: pr.data.head?.ref,
      headSha: pr.data.head?.sha,
    },
    stats: {
      files_changed: files.length,
      files_included: items.length,
      total_additions: files.reduce((s, f) => s + (f.additions || 0), 0),
      total_deletions: files.reduce((s, f) => s + (f.deletions || 0), 0),
      patch_missing_files: items.filter(x => x.patch_missing).map(x => x.filename),
    },
    diffs: items,
    // Optional: You can record gate results here if you parse logs.
    gates: {
      note: "If lint/tests fail, Gemini should not nitpick formatting; focus on high-risk logic only.",
    }
  };

  fs.writeFileSync("review_bundle.json", JSON.stringify(bundle, null, 2), "utf8");
  console.log("Wrote review_bundle.json");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
