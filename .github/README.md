# Gemini PR Review Bot (GitHub Actions)

This repo includes an automated PR review bot powered by Gemini. It runs deterministic gates first, builds a structured PR bundle, calls Gemini for analysis + formatting, and posts a single review comment back to the PR.

> **Note:** The main, user‑facing README is in the repo root (`README.md`). If you don’t see step‑by‑step usage here, open the root README.

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

## Workflow location
- `.github/workflows/gemini-pr-review-v2.yml`

## What it does (high level)
- Triggers on PR events: `opened`, `synchronize`, `reopened`, `ready_for_review`.
- Also triggers on new PR comments (`issue_comment: created`) to allow manual re-runs.
- Runs lint/tests as hard gates when `package.json` is present (`npm ci`, `npm run lint`, `npm test`) for PR events.
- Builds a PR bundle with metadata + filtered diffs (`review_bundle.json`).
- Enforces size guardrails; too-large PRs are asked to split (`STOP_REVIEW.txt`).
- Calls Gemini in two passes: analysis -> formatted review.
- Posts a single PR review comment; falls back to an issue comment if needed.
- Optionally posts a short blocker-only follow-up comment.

## Job layout and concurrency
- `gates_and_bundle`: runs on every PR and produces `review_bundle.json`.
- `gemini_review`: runs when `GEMINI_REVIEW_API_KEY` is present. Fork PRs are skipped on `pull_request` events because secrets are unavailable.
- Gemini review is serialized repo-wide via job-level concurrency (`gemini-pr-review-v2-repo-wide`) so gates can still run in parallel.
- Comment-triggered runs skip gates to avoid executing untrusted PR code when secrets are available.
- Workflow permissions required: `contents: read`, `pull-requests: write`, `issues: write`.

## Scripts and responsibilities
- `./.github/scripts/build_review_bundle.mjs`: Fetch PR metadata and diffs, filter files, truncate patches.
- `./.github/scripts/size_guardrail.mjs`: Blocks reviews for oversized PRs.
- `./.github/scripts/gemini_analyze.mjs`: Creates `gemini_findings.json` from the PR bundle.
- `./.github/scripts/gemini_format_review.mjs`: Formats findings into Markdown (`review_final.md`).
- `./.github/scripts/post_pr_review.mjs`: Posts the final review comment.
- `./.github/scripts/post_inline_blockers.mjs`: Optional blocker highlights comment.
- `./.github/package.json`: Bot-only dependencies (`@google/genai`, `@octokit/rest`) installed by the workflow.

## Required secrets
- `GEMINI_REVIEW_API_KEY`: Gemini API key used by the bot.
- `GITHUB_TOKEN`: Provided by GitHub Actions; used for PR API access and posting reviews.

## Optional configuration
- `GEMINI_PRIMARY_MODEL` (default: `gemini-2.5-flash`, set as GitHub Actions repo variable)
- `GEMINI_FALLBACK_MODEL` (default: `gemini-2.0-flash`, set as GitHub Actions repo variable)
- `.github/gemini_context.md`: Optional repo-specific guidance injected into the prompt.

**Model precedence**
1) GitHub Actions repo variables (`GEMINI_PRIMARY_MODEL`, `GEMINI_FALLBACK_MODEL`) passed as env vars by the workflow
2) Script defaults in `./.github/scripts/gemini_analyze.mjs` and `./.github/scripts/gemini_format_review.mjs`

**Model choice rationale**
The primary defaults to `gemini-2.5-flash` for quality. The fallback defaults to a distinct, stable model (`gemini-2.0-flash`) so rate limits or model-specific outages don’t affect both attempts.

## Guardrails and limits (current defaults)
- Files included in bundle: first 80 (after filtering).
- Patch truncation: 12k chars per file.
- Review size guardrail: `> 60` files in bundle or `> 2500` total changes.
- Binary/large files without patches are tracked in `patch_missing_files`.

## Outputs and artifacts
- Inputs artifact (`gemini-review-inputs`): `review_bundle.json`, `STOP_REVIEW.txt`.
- Outputs artifact (`gemini-review-outputs`): `review_bundle.json`, `gemini_findings.json`, `gemini_analyze_raw.txt`, `review_final.md`, `STOP_REVIEW.txt`.
- The formatted review includes a **Coverage Notes** section when patches are missing.

## Failure/edge cases
- If lint/tests fail, the job stops before Gemini steps.
- If Gemini is rate-limited or returns invalid JSON, a fallback review is posted.
- If posting the PR review fails, it falls back to an issue comment.
- Forked PRs do not have access to secrets; Gemini review is skipped automatically.
- Bot-authored comments are ignored to avoid self-triggering loops.

## Comment-triggered re-runs
- Only comments that include `/gemini` trigger a fresh review run (bot comments are ignored).
- Example: `@github-actions /gemini please review`
 - To revert to running on any comment, remove the `contains(github.event.comment.body, '/gemini')` condition in `.github/workflows/gemini-pr-review-v2.yml`.

## Testing the workflow
- Open a PR with a small change.
- Add a new comment on the PR to trigger a comment-run.
- Check Actions for `PR Review (Gates + Gemini v2)` and confirm the review comment posts.
- Add a comment without `/gemini` and confirm the workflow does not start.

## Customization tips
- Adjust file filters and caps in `./.github/scripts/build_review_bundle.mjs`.
- Tune size thresholds in `./.github/scripts/size_guardrail.mjs`.
- Update review prompts in `./.github/scripts/gemini_analyze.mjs` and `./.github/scripts/gemini_format_review.mjs`.
- NPM cache is enabled in the workflow; adjust cache keys as needed.
