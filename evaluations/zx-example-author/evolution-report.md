# zx-example-author Evolution Report

## Current Status

This document started as a single compare snapshot. The active decision flow is now the staged evaluator in `evaluations/zx-example-author/scripts/evolve-skill.mjs`.

Current policy:

- use the cheapest mutators by default
- screen candidates with `codex-mini`
- rerun only finalists in a cheap playoff
- run the full matrix only when a challenger clears the incumbent by margin
- keep the current skill unless a challenger wins the playoff and the verification round

Latest staged run:

- log: `evaluations/zx-example-author/logs/2026-04-01T03-09-30Z-evolution.md`
- mutators: codex (gpt-5.1-codex-mini), copilot (gpt-5-mini), pi (minimal)
- screening: candidate-codex led 4/5 majority, candidate-pi 3/5, skill 2/5
- playoff (3 repeats): skill recovered to 3/5 majority, challengers dropped to 2/5
- result: the current `skill` stayed on top in the playoff
- action: no promotion, no raised requests
- status: evolution plateaued

## Scope

This report compares the baseline `zx-example-author` skill against two evolved alternatives:

- `skill-evolution-zx-example-author`
- `skill-traced-evolution-zx-example-author`

The compare config used for this run is `evaluations/zx-example-author/compare-evolved.yaml`.

## Evaluation Setup

- Benchmark id: `zx-example-author-compare`
- Variants:
  - `codex-mini`
  - `gpt-5-4`
- Profiles:
  - `no-skill`
  - `skill`
  - `skill-evolution`
  - `skill-traced-evolution`
- Requests per cell: `1`
- Prompts:
  - `hello-name`
  - `hello-cop`
  - `gh-involved-repos`
  - `copilot-sdk-repo-summary`
  - `pi-mono-repo-summary`

Artifact root:

- `C:\Users\villa\dev\skill-arena\results\zx-example-author-compare\2026-03-29T16-27-10-487Z-compare`

## Summary

Overall pass counts by profile:

| Profile | Passes |
| --- | ---: |
| `no-skill` | `0/10` |
| `skill` | `4/10` |
| `skill-evolution` | `7/10` |
| `skill-traced-evolution` | `5/10` |

## Findings

### Baseline skill

The baseline skill remains useful for:

- `hello-name`
- `copilot-sdk-repo-summary` with `GPT-5.4`
- `pi-mono-repo-summary` with `GPT-5.4`

It still misses:

- `hello-cop`
- `gh-involved-repos`
- both repo-summary prompts for `codex-mini`

### skill-evolution

`skill-evolution` is the strongest variant in this experiment.

Observed gains:

- `codex-mini` now passes `hello-cop`
- `GPT-5.4` now passes `hello-cop`
- `GPT-5.4` now passes `gh-involved-repos`
- previous repo-summary wins remain intact for `GPT-5.4`

Interpretation:

- scaffold-first guidance helped the model keep exact file sets and literal command shapes
- stronger anti-substitution checks reduced drift on the short example prompts

### skill-traced-evolution

`skill-traced-evolution` improved over the baseline skill, but underperformed `skill-evolution`.

Observed pattern:

- `GPT-5.4` passed all five prompts
- `codex-mini` regressed and lost `hello-name`
- no improvement was recovered for `codex-mini` repo-summary prompts

Interpretation:

- the trace-informed variant improved high-capability behavior
- it still left too much freedom for `codex-mini` on the smallest prompts

## Recommendation

Treat the compare snapshot below as historical evidence, not as the current winner selection rule.

For new iterations:

- keep the local `skill` as the incumbent until the staged evaluator promotes a challenger
- keep `skill-evolution-zx-example-author` and `skill-traced-evolution-zx-example-author` as fixed reference lines
- prefer blends or mutator outputs only after they survive the cheap screen and the playoff

## Remaining Gap

The evolution has plateaued. The persistent failures for `codex-mini` are:

- `gh-involved-repos`: 0% across all profiles in every run — the assertion set requires exact literal shapes (`import { printRepo }`, `gh api user --jq .login`, `--limit 1000 --json repository`, `printRepo(repo);`, `console.log(\`name: \${name}\`);`) that `codex-mini` consistently drifts from
- `copilot-sdk-repo-summary`: inconsistent — passes occasionally but not reliably
- `pi-mono-repo-summary`: inconsistent — scaffold helps but `codex-mini` still drifts on template literals

Further skill mutations are unlikely to fix these without either:

1. stronger model variants in the evaluation matrix
2. relaxing the assertion literals for `gh-involved-repos`
3. adding `gh-involved-repos` to the scaffold-supported set with rigid templates

## Provider Verification

After the compare run, both evolved skill copies were verified directly against the repo-summary scaffold flow to confirm they still work when the task actually needs those variants.

### Scaffold fix applied to both evolved skills

Both evolved copies inherited a real scaffold bug in `scripts/scaffold-example.mjs`.

Problem:

- small examples load templates from `templates/small/<variant>/`
- repo-summary examples actually live in `templates/repo-summary/`
- the script incorrectly tried to resolve repo-summary templates from `templates/repo-summary/<variant>/`

Fix:

- keep `templates/<mode>/<variant>` only for `small`
- use `templates/repo-summary/` directly for repo-summary variants

This fix was applied to:

- `evaluations/zx-example-author/evolved-skills/skill-evolution-zx-example-author/scripts/scaffold-example.mjs`
- `evaluations/zx-example-author/evolved-skills/skill-traced-evolution-zx-example-author/scripts/scaffold-example.mjs`

### `pi-mono-repo-summary`

Verification workspace:

- `evaluations/zx-example-author/verification/pi-mono-repo-summary`

Observed results:

- scaffold generation now succeeds
- `npm install` succeeds
- `npm exec -- tsc --noEmit` succeeds
- a smoke run with `npm exec -- tsx summarize-repo.ts ...` did not finish within the timeout window and did not produce an output file

Interpretation:

- the generated project is structurally valid and currently typechecks
- runtime behavior still needs a credentialed or longer-running smoke test before treating it as fully confirmed

### `copilot-sdk-repo-summary`

Verification workspace:

- `evaluations/zx-example-author/verification/copilot-sdk-repo-summary`

Observed results:

- scaffold generation now succeeds
- `npm install` succeeds
- `npm exec -- tsc --noEmit` fails with current SDK API drift:
  - `Object literal may only specify known properties, and 'model' does not exist in type 'CopilotClientOptions'.`
  - `Property 'chat' does not exist on type 'CopilotClient'.`
- a direct smoke run also fails at runtime on `client.chat.completions.create(...)`

Interpretation:

- the scaffold path is fixed
- the current `@github/copilot-sdk` template is not compatible with the installed SDK contract and needs a dedicated compatibility pass

## Updated Recommendation

The current local `skill` is the active incumbent — it has survived two consecutive full evolution cycles (2026-03-30 and 2026-04-01) through screening, playoff, and stability checks.

For further improvement:

- the `gh-involved-repos` scaffold template should be added to `scripts/scaffold-example.mjs` with rigid literal output — this is the single biggest remaining failure
- the pi mutation of adding `hello-name` to scaffold-supported variants showed promise (3/5 screening) but couldn't sustain through playoff — worth revisiting as a manual change if `hello-name` scaffold coverage is confirmed stable
- evolution is unlikely to yield further gains under the current `codex-mini`-only screening — consider expanding playoff variants or raising request count
