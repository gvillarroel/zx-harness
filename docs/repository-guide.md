# ZX Harness: repository guide

Self-contained skills for authoring and evolving ZX workflows that combine deterministic tools, TypeScript harness SDKs, model calls, and quality gates. Generated workflows are intended to remain standalone after scaffolding.

## Layout

| Path | Responsibility |
| --- | --- |
| `skills/` | Standalone author/evolver bundles, dataset-authoring contracts, runtime assets, and validators. |
| `.specs/adr/` | Durable workflow and evaluation decisions. |
| `docs/` | User orientation and repository maintenance. |
| `SPEC.md` | Global product and workflow contract. |
| `.github/workflows/` | Deterministic validation CI. |

## Documentation policy

- Keep the root `README.md` focused on purpose, critical constraints, and the first useful action. Put detailed procedures in `docs/`.
- Maintain `docs/README.md` as the navigation index whenever a guide is added or moved.
- Preserve existing specification, ADR, skill-contract, and evidence locations. Link to their owners instead of copying authoritative content.
- Keep implementation, configuration, source data, and generated output separate. Do not create empty folder hierarchies without a concrete need.
- Use portable relative links. Update both outgoing links and inbound references when moving a document.
- Document prerequisites, commands, expected outcomes, and limitations. Never describe an unrun check as verified.

## Change workflow

1. Read `AGENTS.md`, this index, and the relevant source contract.
2. Inspect `git status` and preserve pre-existing changes and staged files.
3. Make a focused change and update affected documentation in the same change.
4. Run the applicable checks below, inspect the diff, and record any unavailable prerequisite.
5. Stage explicit paths. Publish only when authorized; do not force-push or merge unrelated work.

## Validation

```sh
node skills/zx-workflow-author/scripts/validate-skill.mjs
node skills/zx-workflow-evolver/scripts/validate-skill.mjs
```

Run the owning bundle's additional deterministic validators when its resources change. Model-backed Harbor runs require the declared dataset and evidence boundary; they are not a documentation smoke test.

## Data and operating boundaries

Keep product artifacts under `skills/`, preserve standalone runtime boundaries, and leave generated workflows, study jobs, and installed skill libraries out of root documentation. Do not include uncommitted experimental skills in a published catalog until their bundle is published and validated.

Bundled Harbor tasks remain smoke probes owned by their skill. Use
[`harbor-author-evaluation-datasets`](../skills/harbor-author-evaluation-datasets/SKILL.md)
to author any larger external cohort, keep its rendered tasks and sealed splits
outside this repository, and pass completed split roots to the maintained study
organizer. Do not create a second repository-level evaluation runtime.

[Back to the documentation index](README.md).
