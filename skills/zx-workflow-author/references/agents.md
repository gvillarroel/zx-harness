# Agent Contexts

An agent adapter names provenance and defines one non-interactive, shell-free process boundary.
Inspect the installed CLI's help; do not infer flags from another version.

## Adapter contract

- `provider`: audit label such as `codex`, `copilot`, `pi`, or `opencode`.
- `command`: executable resolved by the target environment.
- `args`: fixed argv with optional `{model}`, `{prompt}`, `{root}`, or `{runDir}` placeholders.
- `promptMode`: `stdin` by default; `argument` requires `{prompt}` in `args`.
- `resultFormat`: `text` by default, or `codex-jsonl` for metered Codex output.
- `cwd`: optional repository-relative working directory.
- `env`: bounded non-secret configuration only. An exact `{runDir}/<safe-relative-file>` value also
  declares that one diagnostic-artifact sink.
- `authEnv`: optional unique supported credential names to copy from the host; values never enter the plan.
- `timeoutMs`: explicit limit for the process.

Per-process timeouts are subordinate to the plan's remaining wall-time budget. Count every producer
and reviewer launch against `maxAgentCalls`, including failed processes and retries. Reserve the call
before launch so concurrent or failed execution cannot bypass the limit. A timed-out or unsettled
process is unsuccessful even when its direct child reports exit zero; receipts retain both facts.

Before scaffolding, require `maxAgentCalls` to admit the one-attempt happy path: one call for each
agent stage plus one call for each configured reviewer. Dry-run JSON reports that minimum, the
retry-expanded worst case, the configured limit, and whether the minimum fits.

Argument mode must contain `{prompt}` exactly once; stdin mode must contain it zero times. All
placeholders are allowlisted per field. Each model process receives a minimal OS environment,
declared non-secret `env`, explicit `authEnv` values, isolated home/temp directories, and closed
stdin. Supported credential names are `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`,
`GOOGLE_API_KEY`, and `XAI_API_KEY`; Codex also receives `OPENAI_API_KEY` when available. Other host
variables do not cross the model boundary.

An artifact sink path is canonical, portable, repository-relative beneath the process run view,
unique per agent, and cannot target runtime ledgers, checkpoints, work roots, projections, homes, or
Windows device aliases. After each spawned call the runtime verifies source identity, reads only the
new bounded bytes, and appends them in call order to the same relative path under the public run
directory. The caps are 1 MB per sink per call and 16 MB across one workflow run. Publication occurs
before reviewer projection cleanup and is represented by content-free path, byte, and digest receipt
fields. A bare `{runDir}` remains a disposable private view and grants no publication.

On Windows the runtime executes native `.exe` files directly and resolves known `npm`, `npx`,
`codex`, `pi`, and `opencode` `.cmd` shims to their package JavaScript or executable entrypoints.
It never invokes `cmd.exe`. Copilot's native executable is direct. Timeouts and framing failures
terminate the process tree (`taskkill /T /F` on Windows; process-group signals on POSIX). Windows
does not settle a closed direct child until the in-flight tree killer also closes; one hard deadline
bounds both operations.

Probe availability and non-interactive behavior during authoring. A generated runtime does not select
an untested adapter merely because its executable exists.

## Metered Codex

Use `codex-jsonl` when total workflow cost or nested-agent provenance matters:

```json
{
  "provider": "codex",
  "command": "codex",
  "args": [
    "exec", "--ignore-user-config", "--ephemeral", "--model", "{model}", "--json",
    "--output-last-message", "{lastMessage}", "-"
  ],
  "promptMode": "stdin",
  "resultFormat": "codex-jsonl"
}
```

The runtime gives each call clean temporary `HOME`, `CODEX_HOME`, and `CODEX_SQLITE_HOME` directories.
It copies only a discovered `auth.json` credential into the ephemeral Codex home; inherited skills,
config, MCPs, sessions,
and databases stay outside the child. `--ignore-user-config` is an `exec` flag and follows `exec`.
`--ephemeral` prevents rollout persistence. The final message remains the candidate.
The runtime bounds that message to 1 MB and removes its redundant per-call file after reading it.

Telemetry retains hashes, bounded byte and event counts, terminal usage, timing, and exit state. It never
persists prompts, reasoning, commands, tool output, thread IDs, raw agent messages, or raw JSONL.

`inputTokens` already includes `cachedInputTokens`; `reasoningOutputTokens` is part of `outputTokens`.
Never add either subset again. Pricing stays
outside the workflow because rates and long-context rules change. If an adapter cannot emit structured
usage, its ledger entry uses `usageCoverage: "unavailable"`; do not claim exact total cost.
Plan-level input and output token limits require complete `codex-jsonl` metering for every used agent.
Apply cumulative usage immediately after each call, before any retry or reviewer can start. If a call
does not yield a complete receipt, record `budget_accounting_incomplete` and stop the workflow.
The call's schema-3 receipt is committed first, including postcondition status; every spawned call
therefore has one terminal accounting record even when control drift, malformed framing, candidate
parsing, artifact publication, exit status, or token evidence fails afterward.

## Context boundaries

Use a producer for one ambiguous transformation. Its context contains only the runtime problem,
stage prompt, bounded declared inputs, selected skills, route, and prior rejection feedback.

Use a reviewer only when executable gates cannot cover an important semantic property. Start it as a
new process after deterministic gates pass. Its context contains the problem, candidate, declared
evidence, reviewer prompt, and reviewer-specific skills—never the producer conversation.

With `criteria`, every reviewer declares unique known `covers` and an explicit `inputs` array; `[]`
means no file evidence. Its isolated context contains only the immutable problem, candidate, reviewer
prompt, assigned criteria, selected skills, and those reviewer inputs. Producer inputs are not
inherited; `inheritProducerInputs` may be omitted or `false`, never `true`. The reviewer process runs
under a fresh projection containing only its declared inputs plus fixed immutable problem and
candidate artifacts; `{root}` and `{runDir}` point there. Each criteria-aware input is rejected when
its source exceeds `maxBytes`. Set required positive `maxContextBytes` separately on each producer
and reviewer to reject the fully composed UTF-8 prompt before launch. Legacy plans
without `criteria` retain the previous truncated declared-evidence behavior.

Configure reviewer adapters in the CLI's read-only or approval-free analysis mode. The runtime also
checkpoints and restores every declared mutation around a review; CLI permissions remain responsible
for blocking undeclared writes.

Prefer heterogeneous reviewers only when their tools or failure modes differ materially. Agreement
between agents is evidence, not truth; executable checks retain higher authority.

## Residual operating-system limits

The projection is capability minimization, not an OS sandbox. A subprocess can still access paths or
services permitted by its host account, and a hostile program can deliberately detach or use native
OS escape mechanisms. POSIX process groups clean ordinary inherited descendants; Windows tree kill
cannot prove removal of a grandchild that detached and exited its parent before observation without
Job Objects. Link safety and atomic publication depend on Node filesystem primitives and local
filesystem inode/link semantics. Without portable conditional rename or descriptor-relative
no-follow traversal on Windows, hostile concurrent same-UID target or ancestor swaps can race the
final identity check. Required authentication remains a deliberate provider capability.
