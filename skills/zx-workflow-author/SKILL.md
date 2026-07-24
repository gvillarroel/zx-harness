---
name: zx-workflow-author
description: Generate or improve standalone zx and TypeScript workflows that coordinate deterministic CLIs, Jira or GitHub data, local TF-IDF, Codex, Copilot, pi, OpenCode, or command-adapted harnesses, model routing, executable quality gates, bounded retries, and rollback. Use when Codex must turn a repository task into an autonomous, token-efficient script with rich control flow and verified outputs.
---

# zx Workflow Author

## Workflow

1. Read the target repository instructions, manifests, tests, and relevant ADRs.
2. Convert the task into observable acceptance evidence before choosing tools.
3. Assign deterministic collection, search, parsing, ranking, and validation to static stages.
4. Assign only ambiguous synthesis, code design, or repair to a harness stage.
5. Define each intelligent stage's gate before its prompt.
6. For topic research, read [references/topic-knowledge.md](references/topic-knowledge.md), then
   scaffold the four small harness entrypoints:

   ```bash
   node <skill-directory>/scripts/scaffold-topic-knowledge.mjs <target-directory>
   ```

7. Run `npm install`, then execute one harness with one topic:
   `npm run <codex|copilot|pi|opencode> -- "<topic>"`.
8. For other work, create [references/workflow-spec.md](references/workflow-spec.md) and run
   `node <skill-directory>/scripts/scaffold-workflow.mjs <plan.json> <target-directory>`.
9. Inspect commands, paths, mutation declarations, and gates.
10. Execute the smallest safe fixture and keep only a proven workflow.

## Composition Rules

- Use static tools first. Never spend model tokens on listing, grep, JSON parsing, schemas, tests,
  TF-IDF, or exact comparisons.
- Pass dynamic arguments as arrays. Do not interpolate them into a shell command.
- Reduce context before the harness. Rank files, cap bytes, and send only evidence needed by the
  prompt.
- Prefer one sequential workflow with explicit loops and branches over distributed hidden state.
- Stage harness output. Promote it only after the gate passes.
- Feed exact gate stdout and stderr into retries.
- Start with the least expensive capable model. Use the stronger model only after a failed gate.
- Declare every path a command may mutate. Terminal failure must restore those paths.
- Keep credentials out of plans, prompts, logs, and model output.
- Make expensive, remote, or destructive commands opt-in through plan arguments or environment.
- For topic batches, keep deterministic collection in the shared runtime and one short,
  prompt-specific wrapper per installed harness.
- Generate Codex, Copilot, pi, and OpenCode wrappers. A new harness needs only another wrapper
  around the exported `runHarness` contract.

## Resource Routing

- Read [references/workflow-spec.md](references/workflow-spec.md) before writing a plan.
- Read [references/harnesses.md](references/harnesses.md) when selecting an SDK or model.
- Read [references/gates.md](references/gates.md) for gate and rollback design.
- Read [references/real-tasks.md](references/real-tasks.md) when adapting the skill to repository
  quality or feature work.
- Read [references/topic-knowledge.md](references/topic-knowledge.md) for incremental, multi-source
  `know` and Open Knowledge Format workflows.

## Acceptance

- Generated files are project-local and do not reference this skill directory.
- `npm run dry-run` prints every stage, model route, gate, retry limit, and mutation.
- Every harness stage has a gate and a bounded attempt count.
- Every mutating command has a gate and complete `mutates` paths.
- An offline fixture proves retry feedback and strong-model escalation.
- A failing fixture proves declared mutations are restored.
- Topic fixtures prove four distinct prompts, new-file-only processing, OKF validation, and the
  negative byte-size objective.
