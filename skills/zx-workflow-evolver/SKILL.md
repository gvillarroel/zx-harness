---
name: zx-workflow-evolver
description: Evolve and optimize generated zx or TypeScript workflow scripts with repeatable Harbor tasks, measurable quality dimensions, frozen baselines, bounded mutations, disjoint development and holdout cases, and fail-closed promotion. Use when a generated automation works but needs evidence-based gains in correctness, resilience, token efficiency, determinism, rollback, or secret safety.
---

# zx Workflow Evolver

## Workflow

1. Read the target repository instructions, the script, its plan, tests, and relevant ADRs.
2. Read [references/benchmark-contract.md](references/benchmark-contract.md).
3. Convert observed risks into independent Harbor tasks or hidden cases with numeric rewards.
4. Freeze the baseline script, config, dependency lock, task digests, Harbor version, agent, and model.
5. Partition cases by task family into development, validation, and untouched holdout cohorts.
6. Run the baseline before proposing changes.
7. Read [references/evolution-loop.md](references/evolution-loop.md).
8. Change one explicit behavior per candidate. Preserve the original and record the hypothesis.
9. Use development diagnostics to repair candidates and validation rewards to select them.
10. Run the selected candidate and frozen baseline on identical holdout attempts.
11. Promote only when provenance matches, no trial errors exist, mean reward improves, and no protected
    metric or task family regresses.

## Harbor Commands

Validate the bundled complex benchmark:

```bash
node <skill-directory>/scripts/run-benchmark.mjs --validate-only
```

Execute its reference solution through Harbor's `oracle` agent:

```bash
node <skill-directory>/scripts/run-benchmark.mjs
```

The runner uses Harbor 0.18.0, creates a unique evidence directory, and never overwrites a prior job.
On Windows it uses WSL when Harbor and Docker are available there.

## Mutation Rules

- Keep static collection, parsing, ranking, hashing, and gates outside model calls.
- Reduce model inputs before changing model size or retry count.
- Prefer a narrower prompt, stronger gate feedback, or bounded retry before a stronger model.
- Stage generated content until its gate passes.
- Snapshot every declared mutation and restore exact bytes after terminal failure.
- Reject path escape, unbounded input, shell interpolation, hidden network use, and secret-bearing logs.
- Keep dependency and model changes separate from behavioral changes so cost effects remain attributable.
- Do not inspect holdout fixtures, trajectories, or diagnostics before candidate selection.
- Never relabel verifier failure as infrastructure failure or average execution errors into rewards.

## Promotion Record

Record:

- baseline and candidate SHA-256 digests
- Harbor version, task checksums, agent, model, attempts, and environment
- hypothesis and changed behavior
- per-task and per-metric baseline/candidate rewards
- input/output tokens and agent latency when a live model is used
- errors, regressions, and the promotion decision

Reject promotion on missing evidence, fairness drift, any candidate execution error, or protected metric
regression. Treat equal reward with lower tokens or latency as an optimization only when correctness,
resilience, determinism, and security remain unchanged.

## Acceptance

- Harbor resolves the benchmark configuration without mutation.
- The reference job completes with `reward = 1`.
- Hidden cases prove fast-to-strong retry, actionable feedback, context caps, deterministic output,
  path confinement, redaction, and rollback.
- A fresh validation command checks metadata, benchmark structure, the verifier, and the reference
  workflow outside Harbor.
- Generated workflows remain standalone after optimization.
