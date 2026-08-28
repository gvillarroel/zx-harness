# zx-harness Specification

## Purpose

`zx-harness` publishes skills that teach AI agents to author efficient zx workflows.

Generated workflows combine:

1. deterministic CLI or local computation for collection and filtering
2. TypeScript harness SDKs only for work that needs intelligence
3. executable gates that accept, retry, escalate, or roll back each result

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
- define the acceptance gate before the intelligent stage
- stage model output until its gate passes
- retry with concrete gate feedback
- snapshot declared mutations and restore them after terminal failure
- persist an inspectable run log without secrets
- support dry-run planning

## Supported Composition

- Static: any non-interactive CLI, Jira clients, GitHub CLI, tests, schemas, and local TF-IDF
- Intelligent: short Codex, Copilot, pi, and OpenCode wrappers plus arbitrary command adapters
- Gates: commands, required text, and required JSON paths
- Knowledge: one-topic entrypoints, `know` sources, per-harness hash ledgers,
  staged OKF Markdown publication, and deterministic index updates

## Validation

CI must validate skill metadata, scaffold real-task plans, execute an offline retry fixture, and
prove rollback restores a declared mutation.

Evolution skills must also validate a native Harbor 0.18.0 task, publish a passing oracle solution,
score correctness, resilience, efficiency, security, and determinism independently, and keep
development, validation, and holdout evidence separate.

Script-size evolution must expose `MAX_SCRIPT_BYTES`, measure `script_size_bytes`, optimize
`script_size_negative = -script_size_bytes`, and keep functional gates non-compensating.
