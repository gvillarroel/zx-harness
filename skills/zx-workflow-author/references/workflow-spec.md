# Workflow Plan

Use one JSON object:

```json
{
  "name": "portable-doc-links",
  "description": "Detect, repair, and verify non-portable Markdown links.",
  "stages": []
}
```

Paths are repository-relative. Commands never use a shell.

## Command Stage

```json
{
  "id": "collect-jira",
  "kind": "command",
  "command": "acli",
  "args": ["jira", "workitem", "view", "PROJ-123", "--json"],
  "stdout": "run/jira.json",
  "attempts": 1,
  "gate": {
    "kind": "json",
    "path": "run/jira.json",
    "required": ["key", "summary"]
  }
}
```

Add `cwd`, `env`, and `timeoutMs` only when needed. Add every repository path a command may change
to `mutates`. A mutating command requires a gate.

## TF-IDF Stage

```json
{
  "id": "rank-evidence",
  "kind": "tfidf",
  "query": "coverage gaps retry crawl product documentation",
  "roots": ["docs", "data/step-02/current"],
  "extensions": [".md", ".json"],
  "output": "run/ranked.json",
  "limit": 20,
  "maxFiles": 1000,
  "maxBytesPerFile": 24000,
  "gate": {
    "kind": "json",
    "path": "run/ranked.json",
    "required": ["0.path", "0.score"]
  }
}
```

Use `queryFile` instead of `query` when the task text already exists locally.

## Harness Stage

```json
{
  "id": "design-fix",
  "kind": "harness",
  "provider": "copilot",
  "prompt": "Propose the minimum patch. Cite evidence paths and verification commands.",
  "inputs": [
    {"path": "run/jira.json", "maxBytes": 12000},
    {"path": "run/ranked.json", "maxBytes": 24000}
  ],
  "output": "run/proposal.md",
  "attempts": 2,
  "models": {
    "fast": "gpt-5-mini",
    "strong": "gpt-5.4"
  },
  "gate": {
    "kind": "contains",
    "values": ["Evidence:", "Verification:"]
  }
}
```

For pi, set `provider` to `pi` and use `provider/model` identifiers:

```json
{"fast": "github-copilot/gpt-5-mini", "strong": "openai-codex/gpt-5.4"}
```

## Gates

- `contains`: every value must exist in `path` or the current harness candidate.
- `json`: JSON must parse and contain every dotted `required` path.
- `command`: exit code zero passes. Use `{candidate}`, `{root}`, and `{runDir}` placeholders in
  argument arrays.

Keep attempts between 1 and 4. Attempt one uses `models.fast`; later attempts use `models.strong`
and receive the previous gate diagnostics.
