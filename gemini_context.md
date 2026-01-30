# Repo Review Context

## Architecture
- (Briefly describe key layers / modules and what belongs where.)

## Coding standards
- Prefer small functions; avoid deep nesting.
- Comments should explain **why**, not what.
- Error handling must be explicit; avoid swallowing exceptions.

## Security & privacy
- Never log secrets or PII.
- Validate all external inputs.
- Use least-privilege authz checks.

## Performance
- Avoid N+1 queries.
- Any new loops over large collections should justify complexity.

## Testing philosophy
- New behavior requires tests.
- Include at least: happy path + 1 failure/edge case.
