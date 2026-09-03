# Repository Guide

## Layout

| Path | Responsibility |
| --- | --- |
| `skills/zx-workflow-author/` | The only product skill, scaffolder, runtime, references, and tests. |
| `.specs/adr/` | Durable architecture decisions and superseded history. |
| `docs/` | Human orientation and maintenance. |
| `SPEC.md` | Current product contract. |
| `.github/workflows/` | Deterministic validation. |

Do not add another directory or `SKILL.md` under `skills/`. New agent adapters, gates, skill-routing
rules, evaluation lessons, or problem-class guidance belong inside `zx-workflow-author` when they are
general enough to publish.

## Change workflow

1. Read `AGENTS.md`, `SPEC.md`, relevant ADRs, and the owning skill resource.
2. Preserve unrelated working-copy changes.
3. Encode a composition change in the narrowest instruction, reference, scaffolder, or runtime layer.
4. Add an observable offline regression test.
5. Run the validator and inspect `git diff --check`, links, generated output, and the final diff.

## Validation

```bash
node skills/zx-workflow-author/scripts/validate-skill.mjs
```

Model-backed evaluations are development evidence, not a CI requirement. Keep private tasks, answers,
verifiers, credentials, traces, and sealed splits outside tracked source.

[Documentation index](README.md)
