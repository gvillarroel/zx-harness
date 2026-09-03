# zx-harness Specification

## Purpose

`zx-harness` publishes one skill: `zx-workflow-author`. It teaches an agent to generate a standalone
zx program that receives a problem at runtime and orchestrates the best available deterministic tools,
skills, agents, and acceptance gates for that problem class.

The generated program, not this repository or an encoded example answer, solves each problem.

Primary problem types include repository issue triage, resolution of a concrete repository issue,
code review, and other recurring software-engineering workflows with equivalent evidence boundaries.

## Product Boundary

`skills/` must contain exactly `skills/zx-workflow-author/` and exactly one `SKILL.md`. Benchmark,
dataset-authoring, evolution, provider, and repository-specific concerns are inputs to the authoring
policy—not separately published skills.

Root files provide governance, discovery, and CI. Human procedures live under `docs/`. Generated
workflows must not depend on this repository after scaffolding.

## Authoring Objective

The skill must generate one reusable workflow for a declared problem class. At authoring time it:

1. identifies observable acceptance evidence and mutation boundaries
2. identifies whether the workflow is triage, issue resolution, code review, or a custom problem type
3. inventories available non-interactive code-assistant CLIs and exact agent adapters
4. assigns deterministic work before intelligent work
5. separates producer, reviewer, and retry contexts
6. selects only relevant skills for each context
7. defines executable gates before prompts
8. chooses bounded model routes, retries, promotion, and recovery
9. validates representative runtime problems for the intended type

The author may inspect stable repository evidence and installed tool help. It must not inspect sealed
evaluation answers or encode task-specific patches, verifier internals, or generated-result helpers.

## Generated Workflow Contract

Generated workflows must:

- expose one `#!/usr/bin/env zx` entrypoint named `solve.mjs`
- require one runtime `--problem` or `--problem-file`, except dry-run planning
- pass dynamic values through argv arrays or closed stdin without shell interpolation
- keep the problem immutable across stages and retries
- collect, filter, and rank context deterministically before invoking an agent
- cap every file and context independently
- start a fresh process for every producer attempt and reviewer
- give each context only its prompt, declared inputs, selected skills, and applicable feedback
- embed selected Markdown guidance and references by name and SHA-256 without a runtime library
- treat injected skills as advisory and unable to broaden authority
- use the least expensive capable model first and escalate only after concrete rejection evidence
- require a deterministic gate for every agent stage
- run deterministic gates before optional independent reviewer agents
- feed bounded, redacted gate or reviewer feedback into bounded retries
- snapshot declared mutations, restore before retry, and restore after terminal failure
- stage candidate output and promote it atomically only after all gates pass
- persist an inspectable JSONL event log without raw problems or secrets
- support dry-run inspection of stages, routes, skills, gates, reviewers, retries, and mutations

Use an isolated Git worktree when a mutating agent's paths cannot be enumerated safely.

## Composition Evolution

Evaluation improves the single skill's composition policy. It may change stage boundaries, context
budgets, skill selection, agent routing, gates, reviewers, retry behavior, or recovery rules. It must
not publish another skill or specialize the runtime to evaluation answers.

Only disjoint development evidence may diagnose, rank, or select a change. Freeze one candidate before
sealed validation; validation accepts or rejects without feeding another mutation into the same study.
Promote only general rules supported across problem families with no protected-metric regression.

## Validation

CI must prove:

- exactly one skill directory and one `SKILL.md` exist under `skills/`
- metadata and the plan schema are valid
- generated workflows are standalone and expose `solve.mjs`
- runtime problems remain one argv value and drive default TF-IDF selection
- producer and reviewer contexts receive only their selected digest-bound skills
- deterministic rejection escalates the configured model and preserves feedback
- reviewers run in independent contexts and can reject a candidate
- representative issue-triage, issue-resolution, and code-review plans run through the same skill
- logs redact common credentials
- retries restore checkpoints and terminal failure rolls back mutations
