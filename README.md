# Gemini PR Review Bot (GitHub Actions)

A GitHub Actions workflow that builds a structured PR bundle, runs deterministic gates, sends the bundle to Gemini for analysis + formatting, and posts a single PR review comment back to the PR.

This repo is designed to be copied into your own repository. It is not published as a marketplace action.

## Quickstart (copy into your repo)

1) Copy these files into your repo:
- `.github/workflows/gemini-pr-review-v2.yml`
- `.github/scripts/`
- `.github/package.json` and `.github/package-lock.json`
- `.github/gemini_context.md` (optional)

2) Add secrets in your repo:
- `GEMINI_REVIEW_API_KEY` (required to enable Gemini steps)
- `GITHUB_TOKEN` (provided automatically by Actions)

3) Open a PR and wait for the workflow to comment, or trigger manually with a comment:
```
@github-actions /gemini please review
```

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

## Security and privacy
- Fork PRs do not have access to secrets, so Gemini review is skipped.
- Bundle size is capped and patches are truncated before sending to Gemini.
- Workflow artifacts include the bundle and output; review these if your repo contains sensitive data.

## License
MIT (see `LICENSE`).


_Test change for Gemini review workflow._

_Second test change for Gemini review workflow._

_Third test change for Gemini review workflow._
