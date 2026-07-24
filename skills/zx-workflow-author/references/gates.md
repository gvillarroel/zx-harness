# Gates and Recovery

Define gates from acceptance criteria, not from likely model wording.

## Preferred Order

1. parser or schema
2. compiler or type checker
3. focused unit test
4. repository validation command
5. exact content invariant
6. model review only when no deterministic oracle exists

## Retry

Use gate stdout and stderr as the retry payload. Preserve the original task and static evidence.
Do not rerun expensive collection unless the gate proves that evidence is stale.

Attempt one uses the fast model. Later attempts may use the strong model. Stop after four attempts.

## Mutation Safety

Model output is a candidate, not a repository write. Gate it before promotion.

For commands that change the repository:

- list every affected file or directory in `mutates`
- snapshot before the first attempt
- run the command
- run its gate
- restore the snapshot after terminal failure

Use a temporary output root when affected paths cannot be enumerated. Do not claim rollback coverage
for undeclared paths.

## Useful Gates

- Jira extraction: JSON has issue key, summary, and acceptance criteria.
- TF-IDF: result array is non-empty and top entries have path and score.
- Summary: required sections exist and cited paths are present in input evidence.
- Code: formatter, type checker, focused tests, then repository tests.
- Data pipeline: schema, counts, provenance, and minimum quality threshold.
- Documentation: link/path scanner plus renderer when layout matters.
