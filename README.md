# zx-harness

Skills for authoring zx workflows that combine deterministic tools, TypeScript harness SDKs, and
quality gates.

Available skills:

- [`zx-workflow-author`](skills/zx-workflow-author/SKILL.md): generate project-local workflows with
  static collection, TF-IDF reduction, built-in Codex/Copilot/pi/OpenCode routing, arbitrary harness
  adapters, model escalation, retries, and incremental multi-source knowledge ingestion.
- [`zx-workflow-evolver`](skills/zx-workflow-evolver/SKILL.md): optimize generated workflows with
  repeatable Harbor evidence, protected metrics, and holdout promotion.

Validate:

```bash
node skills/zx-workflow-author/scripts/validate-skill.mjs
node skills/zx-workflow-evolver/scripts/validate-skill.mjs
```

See [`SPEC.md`](SPEC.md) for the contract.
