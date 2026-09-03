# ZX Harness

One skill generates standalone zx programs for recurring code-assistant work such as repository issue
triage, issue resolution, and code review. Generated programs accept each concrete problem at runtime
and combine deterministic context reduction, isolated agent calls, selected skills, executable gates,
independent review, retries, and rollback.

Start with [`zx-workflow-author`](skills/zx-workflow-author/SKILL.md). Its generated `solve.mjs` can
orchestrate Codex, Copilot, pi, OpenCode, or another tested non-interactive agent without depending on
this repository.

```bash
node skills/zx-workflow-author/scripts/validate-skill.mjs
```

## Documentation

- [Usage](docs/getting-started.md)
- [Repository guide](docs/repository-guide.md)
- [Specification](SPEC.md)
- [Architecture decisions](.specs/adr/)
- [Agent instructions](AGENTS.md)
