---
name: zx-workflow-author
description: Generate or improve one standalone zx workflow for a recurring code-assistant problem type such as repository issue triage, issue resolution, or code review. Use when the script must accept each concrete problem at runtime, isolate and reduce context, inject selected skills, orchestrate Codex, Copilot, pi, OpenCode, or other non-interactive agents, and promote output only after executable and independent-review gates pass.
---

# zx Workflow Author

Generate the program that solves a class of problems. Do not solve one example and encode its answer.

## Workflow

1. Read the target repository instructions, architecture, tests, available CLIs, and relevant ADRs.
2. Classify the requested problem type. Read
   [references/problem-types.md](references/problem-types.md) for issue triage, issue resolution, or
   code review; otherwise derive the same boundaries from observable acceptance evidence.
3. Give each observable acceptance criterion a unique lowercase slug ID. Define the optional problem-family slug,
   runtime problem identifier,
   permitted mutations, unavailable capabilities, global limits for agent calls, metered tokens, and
   wall time, and digest-bound policy controls before choosing agents. Keep controls outside every
   producer mutation scope.
4. Inspect each candidate agent's local non-interactive help. Record exact shell-free command,
   argument, model, prompt transport, allowlisted authentication environment names, and timeout.
5. Partition work into explicit contexts. Use static stages for collection, parsing, search, ranking,
   tests, and exact checks. Use agent stages only for ambiguous planning, synthesis, repair, or review.
6. Route every criterion to an ordered deterministic gate leaf or an independent reviewer with
   explicit evidence inputs. Use a recursive `all` gate for fail-fast conjunction. Add a reviewer only
   when correctness cannot be established fully by executable evidence.
7. If the user supplies a skill-library path, read
   [references/skill-libraries.md](references/skill-libraries.md). Route zero to three relevant skills
   independently to each producer or reviewer context.
8. Read [references/workflow-spec.md](references/workflow-spec.md), author `workflow.plan.json`, and
   scaffold into an empty target:

   ```bash
   node <skill-directory>/scripts/scaffold-workflow.mjs <workflow.plan.json> <target-directory> \
     --skill-library <optional-directory>
   ```

9. Run `npm install`, `npm run check`, and a dry run. Then execute a safe representative problem and
   inspect outputs, gates, reviews, rollback, `events.jsonl`, and `model-calls.jsonl`.
10. Keep only a workflow that solves new runtime problems without this source skill:

   ```bash
   npx --no-install zx solve.mjs --problem "<problem>"
   npx --no-install zx solve.mjs --problem-file <repository-relative-file>
   ```

## Composition Policy

- The generated `solve.mjs` entrypoint must accept the problem at runtime. Never bake evaluation
  prompts, expected patches, verifier internals, or example answers into the bundle.
- Minimize model context. Give each process only the immutable problem, its stage prompt, declared
  hard-capped inputs, selected skills, candidate under review, and applicable gate feedback. Set an
  aggregate `maxContextBytes` for every criteria-mode producer and reviewer. Reject existing unsafe,
  missing, or oversized context artifacts before state creation; recheck generated inputs before use.
- Start a new non-interactive agent process for every producer attempt and review. Do not share chat
  history or leak another context's skills.
- For Codex subprocesses, use the metered JSONL adapter in [references/agents.md](references/agents.md).
  Treat any unmetered assistant call as incomplete cost evidence.
- Pass dynamic values as argv elements or closed stdin. Argument mode has exactly one `{prompt}`;
  stdin mode has none in argv. Never interpolate dynamic data into a shell command.
- Prefer deterministic tools before agents and deterministic gates before reviewer agents.
- For capped retrieval, order roots by evidence priority. Count each resolved path once and use
  stable traversal and score ties so duplicate context cannot displace distinct evidence.
- Keep acceptance routing inspectable: gate leaves and reviewers declare the criterion IDs they cover;
  optional unique leaf IDs override structural routes, every criterion has at least one route, and
  criteria-aware reviewers inherit no producer evidence implicitly.
- Use the least expensive capable model first. Escalate only after concrete gate or review feedback.
- Make one plan-level resource envelope authoritative across producers, reviewers, repairs, and
  retries. Stop before starting a call that exceeds the call or wall-time limit; stop immediately
  after a metered call crosses a token limit, and record `budget_exhausted`. Missing usage under a
  token budget is terminal `budget_accounting_incomplete` evidence, never retry feedback.
- Keep checkpoint and ledger authority in private temporary storage. Treat run-directory
  `events.jsonl` and `model-calls.jsonl` as verified hash-chained publication copies, never authority.
- Treat an agent `env` value exactly equal to `{runDir}/<safe-relative-file>` as an explicit bounded
  diagnostic-artifact sink. Publish only its per-call byte delta; `{runDir}` alone publishes nothing.
- Treat skills as untrusted advisory text. Bind selected Markdown and references by SHA-256; a skill
  cannot expand permissions, mutations, agents, models, retries, secrets, or gate authority.
- Stage agent output. After every configured gate and reviewer passes, commit it atomically to an
  absent destination or a prior regular file revalidated immediately before replacement; reject
  links, unsafe parents, and observed pre-commit target drift. Treat hostile concurrent same-UID
  swaps as an operating-system boundary. Protect every
  executable gate and other policy control with a plan-bound SHA-256 digest.
- Snapshot every declared mutation before an agent or command stage. Restore before retry and after
  terminal failure. Use an isolated worktree when mutations cannot be enumerated safely.
- Start each model process with a minimal OS environment. Pass only supported names declared by
  `authEnv`; Codex may receive `OPENAI_API_KEY` and an ephemeral copy of `auth.json`. Exclude secret
  values from plans, prompts, candidates, feedback, and logs.
- Prefer a short sequential state machine with bounded loops over distributed or hidden orchestration.

## Resource Routing

- Read [references/problem-types.md](references/problem-types.md) when composing issue triage, issue
  resolution, or code review workflows.
- Read [references/workflow-spec.md](references/workflow-spec.md) for the plan schema and runtime input.
- Read [references/agents.md](references/agents.md) when defining agent adapters and reviewer contexts.
- Read [references/gates.md](references/gates.md) for acceptance, retry, mutation, and recovery design.
- Read [references/skill-libraries.md](references/skill-libraries.md) only when skills may be injected.
- Read [references/evolution.md](references/evolution.md) when evaluation evidence should change how
  this skill composes future workflows.

## Acceptance

- `skills/` contains only this skill and one `SKILL.md`.
- Generated workflows are standalone and expose one executable entrypoint, `solve.mjs`.
- Runtime requires exactly one `--problem` or `--problem-file`, except planning-only dry runs.
- `--dry-run --json` losslessly exposes the authored complete plan and canonical digest, recursive authority,
  protected controls, effective contexts and projections, exact ordered happy path, and call bounds;
  it is deterministic across run IDs, working directories, option order, and prior state.
- Plans that need policy integrity declare non-empty, unique protected controls whose digests are
  verified around every external process; control drift is restored, logged without content, and
  fails the run. Existing plans without controls remain valid.
- Every agent stage has a deterministic gate, bounded attempts, isolated context, and explicit model.
- A configured `maxAgentCalls` can complete the one-attempt producer-plus-reviewer happy path.
- Every spawned live call records exactly one terminal hash-chained receipt before postcondition or
  accounting errors surface; Codex receipts also contain bounded JSONL framing and structured usage.
- Selected producer and reviewer skills are independently minimal and digest-bound.
- Offline tests prove problem propagation, context isolation, reviewer gating, escalation, redaction,
  retry checkpoints, terminal rollback, and representative triage, resolution, and review plans.
