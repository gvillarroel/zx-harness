---
name: zx-prompt-solver
description: Benchmark prompt-to-program compilation by turning one Harbor or Terminal-Bench prompt into a disposable zx skill and executing only its script. Use for this isolated experiment, not for permanent repository workflows or runtime coding-agent problem solving.
---

# zx Prompt Solver Benchmark

This is an evaluation experiment. It intentionally forbids runtime inference and does not satisfy
the repository issue workflow objective in `SPEC.md`.

## Workflow

1. For external tasks, read [references/evaluation-datasets.md](references/evaluation-datasets.md),
   register disjoint cohorts, and inspect only development content.
2. Read [references/generator-contract.md](references/generator-contract.md). When Harbor injects a
   candidate copy, load this exact path from that copy before generation.
3. Route the exact prompt against `references/solver-skills/catalog.json`. Load at most three
   matching, digest-bound `SKILL.md` bodies; select an executable runtime exclusively.
4. Keep the task instruction as the generator's only task-specific input.
5. Make one tool-free model call and require the declared JSON schema.
6. Validate the generated `SKILL.md` and `scripts/solve.mjs` before upload.
7. Execute only `solve.mjs` in `/app`; its stdout is the answer and its mutations are the submission.
8. Preserve selected-skill digests, the generated bundle, stdout, stderr, usage, and exit code in the
   private Harbor trial.

The generator must never receive directory listings, file contents, command output, tests, solutions,
verifier evidence, prior attempts, or holdout data. Do not make a second model call after script
execution.

## Commands

Validate metadata, prompt isolation, bundle rejection, and script-only execution:

```bash
node <skill-directory>/scripts/validate-skill.mjs
```

Preflight the exact public development task with its task-owned oracle:

```bash
node <skill-directory>/scripts/run-terminal-bench.mjs \
  --dataset terminal-bench/terminal-bench-2@latest \
  --task log-summary-date-ranges \
  --oracle \
  --job-name <unique-slug>
```

Run the same task without `--oracle` only after reward `1`, no exception, and an accessible image.
Use `--dataset <package-or-local-path>`, `--model <provider/model>`, or `--print-config` when needed.
The default dataset is `terminal-bench/terminal-bench-2@latest`. The default model is GPT-5.6 Luna
at medium reasoning. A selected executable runtime deterministically tightens Luna to no reasoning
and 192 output tokens. Use `--power` for GPT-5.6 Sol at max reasoning on measured hard sectors.
`--power` is a whole-trial route, not a fallback or second call. An explicit model uses 4,096 output
tokens without a reasoning override. Pin its exact route; aliases such as `openrouter/free` fail.

## Boundaries

- Keep provider credentials on the Harbor host; never pass them through agent environment config.
- Treat the command as failed when Harbor records an errored trial or an oracle reward other than
  `1`, even if Harbor exits zero. Keep solver reward `0` as an evaluable failure.
- When a provider route normalizes its model name, keep Harbor's reported identity in `model_name` and
  pass the exact inference route in `generator_model_name`; record the latter in generation evidence.
- Install pinned zx under `/tmp/zx-prompt-solver` so generated ESM imports resolve from every bundle.
- Start the script in `/app` when that directory exists; otherwise use `/` for absolute-path tasks.
- Keep Harbor retries at zero so one trial means one generator call.
- Bind every catalog entry to its `SKILL.md` digest. A matching executable runtime is exclusive and
  may be invoked only beneath `ZX_PROMPT_SKILL_ROOT`.
- Keep Luna as the normal script profile. Escalate explicitly to Sol only when task complexity or
  development evidence justifies the cost; never retry a Luna result through Sol in the same trial.
- Reject malformed frontmatter, extra bundle fields, oversized output, hidden evaluation paths,
  model or agent invocations, Docker control, and undeclared package imports.
- Treat generation/provider failure as an execution error. Let a completed script fail through the
  verifier rather than relabeling its nonzero exit as infrastructure failure.
- Pin the dataset version and task checksum after oracle preflight. A non-1 oracle reward, exception,
  or inaccessible image rejects the task before model evaluation.
- Use a new job name for every run and never overwrite prior evidence.
- During one comparison, freeze the complete candidate bundle, model profile, task prompt, runtime,
  and verifier. Bind its contract, router, catalog, and selected-skill bytes before evaluation.
- Do not inspect validation or holdout content while changing the generator contract.

## Acceptance

- A test proves the exact prompt is the sole task-specific model message.
- A test proves Harbor's injected contract becomes the sole fixed system message.
- Tests prove irrelevant prompts receive no solver skill, matching prompts receive only the expected
  digest-bound guidance, and a changed selected skill fails before inference.
- The model has no tools and cannot observe the task environment.
- The generated bundle contains only `SKILL.md` and `scripts/solve.mjs`.
- Generation evidence exposes `generated_script_count = 1`; size cannot compensate for correctness.
- Harbor uploads the frozen bundle and runs one fixed zx entrypoint.
- No post-execution inference, repair, or answer synthesis occurs.
