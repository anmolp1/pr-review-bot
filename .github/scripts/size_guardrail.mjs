import fs from "node:fs";

const bundle = JSON.parse(fs.readFileSync("review_bundle.json", "utf8"));

const maxFilesIncluded = 60;
const maxTotalChanges = 2500; // tune: additions+deletions
const totalChanges = (bundle.stats.total_additions || 0) + (bundle.stats.total_deletions || 0);

if (bundle.stats.files_included > maxFilesIncluded || totalChanges > maxTotalChanges) {
  // Create a marker file that downstream steps can check if you want.
  fs.writeFileSync("STOP_REVIEW.txt", `Too large: files_included=${bundle.stats.files_included}, totalChanges=${totalChanges}\n`, "utf8");
  console.log("PR too large for reliable Gemini review. STOP_REVIEW.txt created.");
  process.exit(0);
}

console.log("PR size within guardrails.");
