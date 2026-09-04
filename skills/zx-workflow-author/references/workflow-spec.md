# Workflow Plan

The generated program solves runtime problems through one JSON plan. Paths are repository-relative;
commands never use a shell. Scaffolding copies a closed allowlist of runtime assets and embeds its
exact strict validator inside `workflow.ts`, so the standalone runtime rejects the identical schema,
caps, paths, argv, environment, and transport without an implementation-only sidecar file.

```json
{
  "name": "repository-problem-solver",
  "family": "issue-resolution",
  "description": "Solve bounded repository issues and verify every accepted change.",
  "criteria": [
    {"id": "tests-pass", "description": "Focused regression tests pass."},
    {"id": "semantic-fit", "description": "The change solves the requested behavior."}
  ],
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
      "authEnv": ["OPENAI_API_KEY"],
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

`family` is optional G008 compatibility metadata: a 1-63 character lowercase slug. It selects the
schema-1 dry-run identity while retaining additive lossless fields; omit it for a new schema-2 plan.
Agent commands are examples, not universal CLI contracts. Inspect installed help before authoring.
Supported placeholders are `{model}`, `{prompt}`, `{problem}`, `{root}`, `{runDir}`, `{lastMessage}`,
and `{candidate}` where the relevant field documents them. Argument transport requires exactly one
`{prompt}` occurrence; stdin transport requires zero and closes stdin after writing the prompt.

Unknown fields are invalid at every typed plan node. Plans are capped at 2 MB, with at most 128
stages, 32 agents, 32 criteria, 64 gate leaves at depth 8, 32 inputs per context, 1 MB per input,
256 argv elements, 128 environment entries, and 24-hour process timeouts. TF-IDF additionally caps
roots, extensions, result count, scanned files, and bytes per file. Repository paths reject rooted,
drive-relative, UNC, traversal, empty, dot, and Windows-invalid segments on every platform. Existing
path trees must contain only ordinary, non-hard-linked files and link-free directories.

An agent environment value exactly equal to `{runDir}/<safe-relative-file>` declares one observable
artifact sink. Text before `{runDir}` or another placeholder in the path does not. A bare `{runDir}`
declares no sink. Sink
paths are canonical and portable, unique per agent, and reject traversal, Windows aliases, device
names, and reserved first segments including `events.jsonl`, `model-calls.jsonl`, `checkpoints`,
`work`, projections, and isolated homes. At most 16 sinks are allowed; each may add 1 MB per call,
and all sinks together may publish 16 MB per run.

`budgets` is one workflow-wide envelope. `maxAgentCalls` counts every producer and reviewer process,
including retries. The wall-time limit caps command, gate, producer, and reviewer process time from
runtime start. Token limits use cumulative structured Codex usage; therefore every selected agent
must use `codex-jsonl` when either token limit is present. Exhaustion is terminal and is recorded as
`budget_exhausted`; missing structured usage is terminal `budget_accounting_incomplete`. Neither
condition grants another repair or review attempt. Offline fixture responses cannot satisfy a token
budget because they have no provider usage receipt.

`criteria` is optional for legacy compatibility. New workflows should declare 1-32 entries with
unique 1-63 character lowercase slug IDs that start and end alphanumeric, and non-empty descriptions
of at most 1,000 UTF-8 bytes. In criteria mode,
every criterion must have at least one gate or reviewer route. `maxAgentCalls`, when present, must fit
the one-attempt happy path: one producer plus every configured reviewer for each agent stage. Every
criteria-mode producer and reviewer requires a positive `maxContextBytes` no larger than 2 MB.

`controls` is optional for compatibility; when declared it must be non-empty. Each entry names one
normalized repository-relative regular file and its exact `sha256:` plus 64 lowercase hex digest.
Entries are unique and cannot equal, contain, or be contained by any stage `mutates` path. Declare
controls whenever executable gates or other repository files define workflow policy. The runtime
verifies them at startup and before and after each agent, reviewer, command, and command-gate process.
It compares content, node type, link state, and permission mode. It restores drift from a private
startup copy, records only path and status in
`protected_control_changed`, and fails closed.

## Static stages

Command stages receive `{problem}` as one argv value. Their `{runDir}` argument and
`ZX_WORKFLOW_RUN_DIR` name the public evidence directory because deterministic commands are trusted;
ledger and checkpoint authority remains private. Add `mutates` and a gate to any mutating stage.

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
Roots retain declared priority. The file cap and document frequencies count unique resolved paths;
overlaps do not spend extra slots. Depth-first directory traversal and equal-score paths use ascending
UTF-8 byte order, independent of filesystem enumeration and locale.

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
  "maxContextBytes": 64000,
  "skills": ["test-driven-development"],
  "output": "run/solution.md",
  "attempts": 3,
  "models": {"fast": "gpt-5.6-luna", "strong": "gpt-5.6-sol"},
  "gate": {
    "kind": "all",
    "gates": [
      {"id": "verification-shape", "kind": "contains", "values": ["Verification:"], "covers": ["tests-pass"]},
      {
        "id": "focused-tests",
        "kind": "command",
        "command": "npm",
        "args": ["test", "--", "--runInBand"],
        "covers": ["tests-pass"]
      }
    ]
  },
  "reviewers": [
    {
      "id": "correctness",
      "agent": "reviewer",
      "model": "review-model",
      "prompt": "Reject unsupported behavior and missing edge cases.",
      "inputs": [{"path": "run/test-report.json", "maxBytes": 12000}],
      "inheritProducerInputs": false,
      "maxContextBytes": 32000,
      "skills": ["code-review"],
      "covers": ["semantic-fit"]
    }
  ]
}
```

A criteria-aware reviewer receives the immutable problem, scrubbed candidate, its own prompt,
assigned criteria, only its explicit `inputs`, and only its selected skills. Its fresh filesystem
projection contains reviewer inputs plus `.zx-reviewer-context/problem.txt` and
`.zx-reviewer-context/candidate.txt`; `{root}`, `{runDir}`, and cwd resolve inside that projection.
`inputs: []` explicitly means no file evidence;
producer inputs are not inherited. `inheritProducerInputs` may be omitted or `false`; `true` is
invalid. In criteria mode, each input `maxBytes` is a hard source-artifact cap, not truncation.
`maxContextBytes` is a required positive aggregate UTF-8 prompt cap checked before each producer or
reviewer launch. Existing context files are type-, link-, size-, and aggregate-checked before state
creation; an input explicitly produced by a prior stage is rechecked before materialization. The
reserved `.zx-reviewer-context` path cannot be declared as an input. A legacy plan without
`criteria` retains truncated evidence and actual producer-input inheritance in reviewer receipts.
Every reviewer must return raw JSON:

```json
{"passed": true, "feedback": "All claims have executable evidence.", "evidence": ["test command"]}
```

Use one to four attempts and at most three producer skills, three reviewer skills per context, and
three reviewers. Scaffold with:

```bash
node <skill-directory>/scripts/scaffold-workflow.mjs <plan.json> <empty-target> \
  --skill-library <optional-library>
```

Use `--state-root <path>` when published evidence must stay outside the target repository. Child
agent-process `{runDir}` maps to its `work/` child, never ledger authority; criteria reviewers map it
inside their disposable projection. Exact agent sink declarations copy only verified bounded deltas
back to the public run directory. Private temporary storage holds
digest-sealed checkpoints and authoritative event and model-call chains; each public `events.jsonl`
or `model-calls.jsonl` is a verified hash-chained copy. Every spawned model process gets exactly one
schema-3 terminal receipt before control, budget-accounting, parse, exit, or output errors surface.
Receipts contain provenance, effective context, latency, termination, auth mode, content-free hashes,
bounded stream counts, and available usage—not prompts or raw messages. Codex JSONL is capped at
16 MB, 1 MB per line, 100,000 events, and 256 event types; framing overflow kills the process tree.
Codex final messages are bounded to 1 MB and per-call temporary files are removed after reading.

Run `solve.mjs --dry-run --json` for one deterministic inspection object. A `family` marker preserves
the released schema-1 identity; other plans use schema 2. Both contain the authored-order lossless
complete plan plus its canonical SHA-256, controls, recursive acceptance matrix, effective contexts and
projection artifacts, selected skill digests, stages, exact ordered happy path, and minimum,
worst-case, and configured call bounds. It is independent of cwd, run ID, prior state, and option
order; `--json` without `--dry-run` is invalid. Runtime
`gate_completed` events contain only the evaluated leaf's route, kind, criterion IDs, and result;
fail-fast leaves that were not evaluated emit no event.

Accepted output publication rejects an existing link, directory, hard link, changed target, or unsafe
parent. The runtime writes and verifies a private random same-directory file, revalidates identities,
then creates an absent destination by exclusive hard link or atomically renames over the revalidated
prior regular file. The prior file remains visible until replacement commits, and pre-commit failure
preserves it without a delete-before-write window. Portable Node APIs do not provide conditional
rename or descriptor-relative no-follow traversal on Windows; a hostile same-UID process can race the
final check and system call, as documented under residual operating-system limits.

A leaf may declare one unique 1-63 character lowercase slug `id` within its stage. That ID becomes
its dry-run and event `routeId`; leaves without an ID retain their deterministic structural route.
Logical `all` nodes cannot declare IDs.
