# Gemini PR Review Bot (GitHub Actions)

A GitHub Actions workflow that builds a structured PR bundle, runs deterministic gates, sends the bundle to Gemini for analysis + formatting, and posts a single PR review comment back to the PR.

This repo is designed to be copied into your own repository. It is not published as a marketplace action.

## How to use (copy into your repo)

1) In your repo, create this exact folder structure (if it doesn’t exist):
- `.github/`
- `.github/workflows/`
- `.github/scripts/`

2) Copy these files/folders from this repo into the same paths in your repo:
- Copy `.github/workflows/gemini-pr-review-v2.yml` → your repo `.github/workflows/gemini-pr-review-v2.yml`
- Copy `.github/scripts/` → your repo `.github/scripts/`
- Copy `.github/package.json` → your repo `.github/package.json`
- Copy `.github/package-lock.json` → your repo `.github/package-lock.json`
- Optional: copy `.github/gemini_context.md` → your repo `.github/gemini_context.md`

3) Add secrets in your repo:
- `GEMINI_REVIEW_API_KEY` (required to enable Gemini steps)
- `GITHUB_TOKEN` (provided automatically by Actions)

4) Open a PR and wait for the workflow to comment, or trigger manually with a comment:
```
@github-actions /gemini please review
```

## How to use (reusable workflow)

If you prefer a reusable workflow, add a workflow file like this:

- Create a new file in your repo at: `.github/workflows/gemini-pr-review.yml`
- Paste the YAML below into that file and commit it.

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
    uses: anmolp1/pr-review-bot/.github/workflows/gemini-pr-review-v2.yml@v1
    with:
      comment_trigger: "/gemini"
      run_gates: true
      node_version: "20"
    secrets:
      GEMINI_REVIEW_API_KEY: ${{ secrets.GEMINI_REVIEW_API_KEY }}
```

For stability, pin to a tag or commit SHA (avoid `@main`).

## Usage demo (step-by-step)
Use this as a literal checklist for a new repo:
1) In your repo, create `.github/workflows/gemini-pr-review.yml`.
2) Paste the reusable workflow YAML above into that file and commit it.
3) In GitHub: Settings → Secrets and variables → Actions → New repository secret → add `GEMINI_REVIEW_API_KEY`.
4) Open a PR with a small change.
5) Confirm a review comment appears.
6) Add a comment containing `/gemini` to re-run the review.

## What it does
- Runs on PR events: `opened`, `synchronize`, `reopened`, `ready_for_review`
- Runs on comment events with `/gemini` to re-run reviews without re-running gates
- Builds a PR bundle with metadata + filtered diffs (`review_bundle.json`)
- Enforces size guardrails to prevent low-signal reviews
- Calls Gemini in two passes: analysis -> formatted review
- Posts a single PR review comment (falls back to an issue comment if needed)

## Configuration

Required secrets:
- `GEMINI_REVIEW_API_KEY`
- `GITHUB_TOKEN` (provided by GitHub Actions)

Optional repo variables:
- `GEMINI_PRIMARY_MODEL` (default: `gemini-2.5-flash`)
- `GEMINI_FALLBACK_MODEL` (default: `gemini-2.0-flash`)

Optional file:
- `.github/gemini_context.md` to inject repo-specific guidance into the prompt.

## Dependency notes
The bot scripts rely on `@google/genai` and `@octokit/rest` and are installed from `.github/package.json` by the workflow.

## Sanity check (minimal repo)
1) Create a new repo with a single `README.md`.
2) Add the reusable workflow snippet above (or copy `.github/` from this repo).
3) Add `GEMINI_REVIEW_API_KEY` to repo secrets.
4) Open a PR with a small change and confirm a review is posted.
5) Add a comment containing `/gemini` and confirm a comment-triggered run posts a review.

## Security and privacy
- Fork PRs do not have access to secrets, so Gemini review is skipped.
- Bundle size is capped and patches are truncated before sending to Gemini.
- Workflow artifacts include the bundle and output; review these if your repo contains sensitive data.

## Release
- Use tags for stable references (e.g., `v1`, `v1.0.0`).
- Keep `v1` pointing at the latest compatible minor/patch release.
- Document breaking changes in release notes.

## Release checklist
- [ ] README updated with usage, permissions, and secrets
- [ ] Workflow validated on a small PR and comment-trigger run
- [ ] Release tagged (`v1` / `v1.x.y`)
- [ ] `v1` moved to the latest compatible release

## Release notes example
Include a short “Usage” section in each release with a copy-paste workflow example. For example:

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
    uses: anmolp1/pr-review-bot/.github/workflows/gemini-pr-review-v2.yml@v1.0.0
    with:
      comment_trigger: "/gemini"
      run_gates: true
      node_version: "20"
    secrets:
      GEMINI_REVIEW_API_KEY: ${{ secrets.GEMINI_REVIEW_API_KEY }}
```

## License
MIT (see `LICENSE`).
