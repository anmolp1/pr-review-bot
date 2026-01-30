# Release vX.Y.Z

## Highlights
- 

## Usage
Copy this workflow into your repo and pin to this release tag:

```yml
name: Gemini PR Review

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
  issue_comment:
    types: [created]

permissions:
  contents: read
  pull-requests: write
  issues: write

jobs:
  gemini_pr_review:
    uses: anmolp1/pr-review-bot/.github/workflows/gemini-pr-review-v2.yml@vX.Y.Z
    with:
      comment_trigger: "/gemini"
      run_gates: true
      node_version: "20"
    secrets:
      GEMINI_REVIEW_API_KEY: ${{ secrets.GEMINI_REVIEW_API_KEY }}
```

## Step-by-step demo
1) Create `.github/workflows/gemini-pr-review.yml` in your repo.
2) Paste the YAML above and commit it.
3) Add repo secret `GEMINI_REVIEW_API_KEY`.
4) Open a PR and confirm a review comment appears.
5) Comment `/gemini` to re-run.

## Notes
- Requires `GEMINI_REVIEW_API_KEY` secret.
- `v1` tag points to the latest compatible release in the v1 series.
