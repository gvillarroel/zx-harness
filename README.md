# ZX Harness

Self-contained skills for authoring and evolving ZX workflows that combine deterministic tools, TypeScript harness SDKs, model calls, and quality gates. Generated workflows are intended to remain standalone after scaffolding.

The author and evolver have separate responsibilities. Preserve protected metrics, evidence provenance, and independent validation when evolving a workflow.

## Get started

Start with the [skill and workflow guide](docs/getting-started.md), then read `SPEC.md` and the owning skill contract. Deterministic checks run with Node.js.

```sh
node skills/zx-workflow-author/scripts/validate-skill.mjs
node skills/zx-workflow-evolver/scripts/validate-skill.mjs
```

## Documentation

- [Documentation index](docs/README.md)
- [Usage and operations](docs/getting-started.md)
- [Repository layout and validation](docs/repository-guide.md)
- [Global specification](SPEC.md)
- [Architecture decisions](.specs/adr/)
- [AGENTS.md](AGENTS.md)
