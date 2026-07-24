# zx-harness Specification

## Purpose

`zx-harness` publishes skills that teach AI agents to author efficient zx workflows.

Generated workflows combine:

1. deterministic CLI or local computation for collection and filtering
2. TypeScript harness SDKs only for work that needs intelligence
3. executable gates that accept, retry, escalate, or roll back each result

## Repository Scope

Product artifacts live only under `skills/`. Root files may provide governance, CI, and discovery.
Do not add standalone examples, docs, evaluations, or a shared runtime framework.

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
- Intelligent: built-in Codex, Copilot, pi, and OpenCode routes plus arbitrary command adapters
- Gates: commands, required text, and required JSON paths
- Knowledge: `know` sources, opt-in harness discovery, immutable prior concepts,
  hash-incremental OKF Markdown publication, and atomic index updates

## Validation

CI must validate skill metadata, scaffold real-task plans, execute an offline retry fixture, and
prove rollback restores a declared mutation.

Evolution skills must also validate a native Harbor 0.18.0 task, publish a passing oracle solution,
score correctness, resilience, efficiency, security, and determinism independently, and keep
development, validation, and holdout evidence separate.
