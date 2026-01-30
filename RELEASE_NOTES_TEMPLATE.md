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

## Notes
- Requires `GEMINI_REVIEW_API_KEY` secret.
- `v1` tag points to the latest compatible release in the v1 series.
