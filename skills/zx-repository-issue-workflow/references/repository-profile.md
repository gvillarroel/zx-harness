# Repository Profile

The profile contains stable repository knowledge, never an issue answer. Use one JSON object:

```json
{
  "schemaVersion": 1,
  "name": "example-issue-workflow",
  "description": "Solve maintenance and feature issues in the example repository.",
  "repository": {
    "summary": "Node ESM library with source in src and tests in test.",
    "architecture": ["src contains product modules", "test mirrors src modules"],
    "conventions": ["Keep public APIs backward compatible", "Prefer focused tests"],
    "roots": ["src", "test", "package.json", "AGENTS.md"],
    "extensions": [".js", ".mjs", ".json", ".md"],
    "alwaysInclude": ["package.json", "AGENTS.md"],
    "ignore": ["node_modules", "dist", "coverage", ".env"],
    "protectedPaths": [".github/workflows"],
    "maxScanFiles": 800,
    "contextFiles": 10,
    "maxFileBytes": 16000,
    "maxContextBytes": 96000
  },
  "models": {
    "luna": "openai-codex/gpt-5.6-luna",
    "sol": "openai-codex/gpt-5.6-sol",
    "lunaThinking": "medium",
    "solThinking": "max"
  },
  "attempts": 2,
  "defaultSector": "maintenance",
  "defaultSkills": ["test-driven-development"],
  "sectors": [
    {
      "id": "maintenance",
      "description": "Localized defects, tests, documentation, and small features.",
      "terms": ["bug", "test", "docs", "validation"],
      "roots": ["src", "test"],
      "model": "luna",
      "skills": []
    },
    {
      "id": "concurrency",
      "description": "Cross-cutting concurrency, race, transaction, or distributed-state changes.",
      "terms": ["concurrency", "race", "transaction", "distributed", "deadlock"],
      "roots": ["src"],
      "model": "sol",
      "skills": ["concurrency-review"]
    }
  ],
  "gates": [
    {
      "id": "tests",
      "command": "npm",
      "args": ["test"],
      "timeoutMs": 180000
    }
  ],
  "pi": {"timeoutMs": 900000}
}
```

## Authoring Rules

- Keep `name` at most 48 lowercase slug characters.
- Describe architecture and conventions, not a requested patch.
- List only tracked repository-relative roots. Exclude credentials, generated data, dependencies,
  VCS internals, and private evaluation files.
- Give each sector distinct terms and roots. Exactly one `defaultSector` must exist.
- Use `model: "luna"` normally. Use `model: "sol"` only when the sector inherently needs frontier
  reasoning; gate feedback never changes this selection.
- Select zero to three external skills per issue after combining `defaultSkills`, sector skills, and
  lexical description relevance. The generated repository guide is always additional.
- Define deterministic gates as executable plus argv. A gate may include `sectors` to limit it.
- Keep attempts from one to three. Every attempt uses the same preselected model.
- `protectedPaths` cannot be changed by an accepted patch. The generated workflow directory is
  protected automatically when it is inside the repository.

The scaffolder rejects unknown fields. This prevents issue text, expected answers, patches, and
verifier instructions from entering the permanent profile through ad hoc keys.

