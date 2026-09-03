Constrains:
- follow SPEC.md
- everything in this repository should be in english
- Less is better, use the min words possible to explain in documentation and comments, high information density is better than long documents
- Add comments to scripts explaining reasoning and every step
- Prefer sequential, async and looping than a lot of functions to decompose on scripts
- Prefer tmux when terminal multiplexing helps
- Before say that something is done, test it manually if is possible
- Keep product artifacts under `skills/`; root files are only for governance, discovery, and CI
- Generated workflows must be standalone after scaffolding
- Record durable technical or workflow decisions as ADRs under `.specs/adr/*.md`
- Read existing ADRs before changing a previously chosen technical direction

## Repository organization and documentation

- Keep `README.md` as an overview: purpose, critical boundaries, first useful action, and links into `docs/README.md`.
- Put detailed procedures and reference material in `docs/`; update its index with every addition or move.
- Follow the [repository guide](docs/repository-guide.md) for file placement, validation, and data boundaries.
- Preserve existing canonical specs, ADRs, skill bundles, and evidence paths; do not reorganize sealed or generated data as documentation.
- Preserve prior work, stage explicit paths, and verify links, relevant checks, and the diff before an authorized push.
- Build tools must not delete authored documentation. Keep transient output and credentials outside tracked source.

## Composition evolution boundary

- Before changing `zx-workflow-author` from Harbor evidence, read its [`evolution` contract](skills/zx-workflow-author/references/evolution.md), the maintained [`harbor-organize-evaluations` contract](../skill-arena/skills/harbor-organize-evaluations/SKILL.md), and the [independent-validation ADR](../skill-arena/.specs/adr/2026-08-01-independent-validation-before-evolution.md). Do not publish an evolver, dataset, benchmark, provider, or problem class as another skill.
- At initialization, register and digest-lock disjoint evolution and validation datasets and plan validation before evolution may run. Only `development`, or schema 2's `evolution` split, may drive diagnosis, mutation, ranking, or selection.
- Freeze and digest-bind one selected candidate before opening validation. Validation is a one-way acceptance gate: never feed its evidence back into the same study; after failure, use a new study and fresh validation. Keep holdout as a third sealed final gate when declared.

## Update Access Scope

- Writable project root: `C:\Users\villa\dev\zx-harness`.
- Agents may create, modify, move, or delete files only inside this root and its descendants when the task requires it.
- Treat paths outside this root as read-only unless the user explicitly authorizes a broader scope.
- A reference to another repository or shared tool does not grant write access to it.
