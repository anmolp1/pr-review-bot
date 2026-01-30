# Contributing

Thanks for considering a contribution.

## How to contribute
1) Open an issue describing the change or bug.
2) Fork the repo and create a feature branch.
3) Make changes and update documentation as needed.
4) Open a pull request with a clear description and test notes.

## Development notes
- The workflow lives in `.github/workflows/gemini-pr-review-v2.yml`.
- Bot scripts are in `.github/scripts/`.
- Bot-only dependencies are in `.github/package.json`.
- Repo-specific prompt guidance lives in `.github/gemini_context.md`.

## Testing
- There is no local test suite for the workflow.
- Validate changes by opening a PR in a test repo and confirming the workflow posts a review.
- For comment-triggered runs, add a comment containing `/gemini`.

## Coding style
- Keep scripts small and focused.
- Avoid adding new external dependencies unless necessary.
- Prefer deterministic outputs; guard against large inputs and rate limits.
