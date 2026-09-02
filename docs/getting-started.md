# ZX Harness: usage and operations

This working-copy guide retains pre-existing local changes that are not part of the published documentation commit. Validate local implementation before publishing those changes.

Run commands from the repository root unless a different working directory is shown.

Skills for authoring zx workflows that combine deterministic tools, TypeScript harness SDKs, and
quality gates.

Product skills:

- [`zx-workflow-author`](../skills/zx-workflow-author/SKILL.md): generate project-local workflows with
  static collection, TF-IDF reduction, short Codex/Copilot/pi/OpenCode scripts, arbitrary harness
  wrappers, stage-scoped skill libraries, model escalation, retries, and incremental knowledge.
- [`zx-workflow-evolver`](../skills/zx-workflow-evolver/SKILL.md): optimize generated workflows with
  repeatable Harbor evidence, negative byte objectives, protected metrics, and holdout promotion.
- [`zx-repository-issue-workflow`](../skills/zx-repository-issue-workflow/SKILL.md): generate one
  repository-specific zx workflow that analyzes new issues, selects native pi skills, invokes Luna
  or pre-routed Sol, gates changes in an isolated worktree, and applies only passing patches.

Benchmark experiments:

- [`zx-prompt-solver`](../skills/zx-prompt-solver/SKILL.md): compile one Harbor task prompt into a
  disposable zx skill and execute only its script. It does not implement the repository issue
  workflow objective.

Validate:

```bash
node skills/zx-workflow-author/scripts/validate-skill.mjs
node skills/zx-workflow-evolver/scripts/validate-skill.mjs
node skills/zx-repository-issue-workflow/scripts/validate-skill.mjs
node skills/zx-prompt-solver/scripts/validate-skill.mjs
```

See [`SPEC.md`](../SPEC.md) for the contract.
