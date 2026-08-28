# ZX Harness: usage and operations

Run commands from the repository root unless a different working directory is shown.

Skills for authoring zx workflows that combine deterministic tools, TypeScript harness SDKs, and
quality gates.

Available skills:

- [`zx-workflow-author`](../skills/zx-workflow-author/SKILL.md): generate project-local workflows with
  static collection, TF-IDF reduction, short Codex/Copilot/pi/OpenCode scripts, arbitrary harness
  wrappers, model escalation, retries, and incremental multi-source knowledge ingestion.
- [`zx-workflow-evolver`](../skills/zx-workflow-evolver/SKILL.md): optimize generated workflows with
  repeatable Harbor evidence, negative byte objectives, protected metrics, and holdout promotion.

Validate:

```bash
node skills/zx-workflow-author/scripts/validate-skill.mjs
node skills/zx-workflow-evolver/scripts/validate-skill.mjs
```

See [`SPEC.md`](../SPEC.md) for the contract.
