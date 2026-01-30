#!/usr/bin/env bash
set -euo pipefail

REPO="anmolp1/pr-review-bot"
REF="${PR_REVIEW_BOT_REF:-v1}"
BASE_URL="https://raw.githubusercontent.com/${REPO}/${REF}"

TARGET_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

if [ ! -d "${TARGET_DIR}/.git" ]; then
  echo "Warning: .git not found in ${TARGET_DIR}. Proceeding anyway."
fi

mkdir -p "${TARGET_DIR}/.github/workflows"
mkdir -p "${TARGET_DIR}/.github/scripts"

fetch() {
  local path="$1"
  local dest="${TARGET_DIR}/${path}"
  echo "Downloading ${path}"
  curl -fsSL "${BASE_URL}/${path}" -o "${dest}"
}

fetch ".github/workflows/gemini-pr-review-v2.yml"
fetch ".github/package.json"
fetch ".github/package-lock.json"
fetch ".github/gemini_context.md"
fetch ".github/scripts/build_review_bundle.mjs"
fetch ".github/scripts/size_guardrail.mjs"
fetch ".github/scripts/gemini_analyze.mjs"
fetch ".github/scripts/gemini_format_review.mjs"
fetch ".github/scripts/post_pr_review.mjs"
fetch ".github/scripts/post_inline_blockers.mjs"

echo ""
echo "Done. Next steps:"
echo "1) Add GEMINI_REVIEW_API_KEY in GitHub: Settings -> Secrets and variables -> Actions."
echo "2) Commit the new files and open a PR."
