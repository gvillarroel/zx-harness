# zx-harness Specification

## Purpose

`zx-harness` publishes skills that teach AI agents to author efficient zx workflows.

Generated workflows combine:

1. deterministic CLI or local computation for collection and filtering
2. TypeScript harness SDKs only for work that needs intelligence
3. executable gates that accept, retry, escalate, or roll back each result

## Repository Issue Workflow Objective

Generate one durable, repository-local workflow from stable repository evidence. Reuse that frozen
workflow across new issues. At runtime it must classify the issue, reduce repository context, select
relevant skills, invoke the pi coding agent, run executable gates, retry with diagnostics, and apply
only a passing patch.

The author may inspect repository structure, instructions, manifests, and tests while generating the
workflow. It must not solve an evaluation issue or embed issue answers, task-specific patches,
verifier internals, or generated-result helpers. The runtime pi call performs the issue analysis and
implementation.

Use GPT-5.6 Luna by default. Route a whole issue to GPT-5.6 Sol only when its predeclared repository
sector requires more capability. Gate results may trigger another bounded attempt on the same model;
they must not cause Luna-to-Sol fallback.

## Repository Scope

Product artifacts live only under `skills/`. Root files may provide governance, CI, and discovery.
Human onboarding and maintenance guides live under `docs/`, indexed by `docs/README.md`.
Do not add standalone executable examples, evaluations, or a shared runtime framework outside the skills.
Generated skills must never depend on repository-level documentation at runtime.

## Skill Contract

Each `skills/<name>/` package must contain:

- `SKILL.md` with only `name` and `description` frontmatter
- `agents/openai.yaml`
- reusable `scripts/`, `references/`, or `assets/` only when required
- a deterministic validation command

Skills must generate project-local workflows. They must not require this repository at runtime.

## Workflow Contract

Generated workflows must:

- use `#!/usr/bin/env zx` for their entrypoint
- pass dynamic CLI arguments without shell interpolation
- keep orchestration in TypeScript when using SDKs
- collect and reduce evidence before invoking a model
- select the least expensive capable model, escalating only after gate feedback
- cap context by file count and bytes
- bind stage-scoped external skill guidance by name and digest without a runtime library dependency
- define the acceptance gate before the intelligent stage
- stage model output until its gate passes
- retry with concrete gate feedback
- snapshot declared mutations and restore them after terminal failure
- persist an inspectable run log without secrets
- support dry-run planning
- generate one repository issue executable; expose planning as its dry-run mode

## Supported Composition

- Static: any non-interactive CLI, Jira clients, GitHub CLI, tests, schemas, and local TF-IDF
- Intelligent: short Codex, Copilot, pi, and OpenCode wrappers, arbitrary command adapters, and
  stage-scoped external skill guidance selected from descriptions
- Gates: commands, required text, and required JSON paths
- Knowledge: one-topic entrypoints, `know` sources, per-harness hash ledgers,
  staged OKF Markdown publication, and deterministic index updates
- Repository issues: one frozen repository profile and zx workflow, native pi skill selection,
  isolated agent worktrees, executable gates, bounded same-route retries, and accepted-patch memory
- Benchmark experiment: one tool-free prompt compiler call, a frozen two-file skill, and one zx
  executor

## Validation

CI must validate skill metadata, scaffold real-task plans, execute an offline retry fixture, and
prove rollback restores a declared mutation.

Evolution skills must also validate a native Harbor 0.18.0 task, publish a passing oracle solution,
score correctness, resilience, efficiency, security, and determinism independently, and keep
development, validation, and holdout evidence separate.

Script-size evolution must expose `MAX_SCRIPT_BYTES`, measure `script_size_bytes`, optimize
`script_size_negative = -script_size_bytes`, and keep functional gates non-compensating.

Prompt solvers must prove the exact task prompt is the only task-specific generator input, reject
invalid bundles before upload, expose `generated_script_count = 1`, execute only the frozen zx
entrypoint, and make no repair call. External development tasks must pass their task-owned oracle in
the pinned Harbor version before inference; bind the dataset version and task checksum.

Repository issue workflow evaluations must freeze one generated workflow across multiple issues in
the same repository. Register disjoint development and sealed validation cohorts before evolution.
Only development evidence may change the workflow. Freeze its digest before releasing validation,
and keep expected answers in verifiers rather than prompts, profiles, skills, or runtime assets.
External repository benchmarks must keep whole repository families in one split. When a benchmark
requires another Harbor-compatible runner, pin it separately, preserve native task bytes and
verifier isolation, and prove artifact provenance before an existing evolver consumes its evidence.
