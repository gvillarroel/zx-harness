# Workflow Plan

The generated program solves runtime problems through one JSON plan. Paths are repository-relative;
commands never use a shell.

```json
{
  "name": "repository-problem-solver",
  "description": "Solve bounded repository issues and verify every accepted change.",
  "budgets": {
    "maxAgentCalls": 6,
    "maxInputTokens": 250000,
    "maxOutputTokens": 30000,
    "maxWallTimeMs": 900000
  },
  "controls": [
    {
      "path": "scripts/verify-acceptance.mjs",
      "sha256": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    }
  ],
  "agents": {
    "solver": {
      "provider": "codex",
      "command": "codex",
      "args": [
        "exec", "--ignore-user-config", "--ephemeral", "--model", "{model}", "--json",
        "--output-last-message", "{lastMessage}", "-"
      ],
      "promptMode": "stdin",
      "resultFormat": "codex-jsonl",
      "timeoutMs": 900000
    },
    "reviewer": {
      "provider": "opencode",
      "command": "opencode",
      "args": ["run", "--model", "{model}", "{prompt}"],
      "promptMode": "argument"
    }
  },
  "stages": []
}
```

Agent commands are examples, not universal CLI contracts. Inspect installed help before authoring.
Supported placeholders are `{model}`, `{prompt}`, `{problem}`, `{root}`, `{runDir}`, `{lastMessage}`,
and `{candidate}` where the relevant field documents them. Prefer stdin for prompts.

`budgets` is one workflow-wide envelope. `maxAgentCalls` counts every producer and reviewer process,
including retries. The wall-time limit caps command, gate, producer, and reviewer process time from
runtime start. Token limits use cumulative structured Codex usage; therefore every selected agent
must use `codex-jsonl` when either token limit is present. Exhaustion is terminal and is recorded as
`budget_exhausted`; missing structured usage is terminal `budget_accounting_incomplete`. Neither
condition grants another repair or review attempt. Offline fixture responses cannot satisfy a token
budget because they have no provider usage receipt.

`controls` is optional for compatibility; when declared it must be non-empty. Each entry names one
normalized repository-relative regular file and its exact `sha256:` plus 64 lowercase hex digest.
Entries are unique and cannot equal, contain, or be contained by any stage `mutates` path. Declare
controls whenever executable gates or other repository files define workflow policy. The runtime
verifies them at startup and before and after each agent, reviewer, command, and command-gate process.
It restores drift from a private startup copy, records only path and status in
`protected_control_changed`, and fails closed.

## Static stages

Command stages receive `{problem}` as one argv value. Add `mutates` and a gate to any mutating stage.

```json
{
  "id": "collect",
  "kind": "command",
  "command": "gh",
  "args": ["issue", "view", "{problem}", "--json", "title,body"],
  "stdout": "run/issue.json",
  "gate": {"kind": "json", "path": "run/issue.json", "required": ["title", "body"]}
}
```

TF-IDF uses the runtime problem as its query unless `query` or `queryFile` is explicit.

```json
{
  "id": "rank-context",
  "kind": "tfidf",
  "roots": ["src", "tests", "docs"],
  "extensions": [".ts", ".md"],
  "output": "run/ranked.json",
  "limit": 20,
  "maxFiles": 1000,
  "maxBytesPerFile": 24000,
  "gate": {"kind": "json", "path": "run/ranked.json", "required": ["0.path", "0.score"]}
}
```

## Agent stage

Every attempt is a fresh process. The first uses `models.fast`; later attempts use `models.strong`
and receive the previous deterministic or reviewer feedback.

```json
{
  "id": "solve",
  "kind": "agent",
  "agent": "solver",
  "prompt": "Produce the smallest complete patch proposal and cite verification evidence.",
  "inputs": [{"path": "run/ranked.json", "maxBytes": 24000}],
  "skills": ["test-driven-development"],
  "output": "run/solution.md",
  "attempts": 3,
  "models": {"fast": "gpt-5.6-luna", "strong": "gpt-5.6-sol"},
  "gate": {"kind": "contains", "values": ["Verification:"]},
  "reviewers": [
    {
      "id": "correctness",
      "agent": "reviewer",
      "model": "review-model",
      "prompt": "Reject unsupported behavior and missing edge cases.",
      "skills": ["code-review"]
    }
  ]
}
```

A reviewer receives the problem, candidate, declared evidence, its own prompt, and only its selected
skills. It must return raw JSON:

```json
{"passed": true, "feedback": "All claims have executable evidence.", "evidence": ["test command"]}
```

Use one to four attempts and at most three producer skills, three reviewer skills per context, and
three reviewers. Scaffold with:

```bash
node <skill-directory>/scripts/scaffold-workflow.mjs <plan.json> <empty-target> \
  --skill-library <optional-library>
```

Use `--state-root <path>` when run evidence must stay outside the target repository. Each run writes
`events.jsonl`; live agent processes also append `model-calls.jsonl` with provenance, latency, exit
state, content-free stream hashes and counts, and available usage. Raw agent JSONL is never persisted.
Codex final messages are bounded to 1 MB and their per-call temporary files are removed after reading.
