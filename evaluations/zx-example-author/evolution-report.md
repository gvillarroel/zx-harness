# zx-example-author Evolution Report

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

Use `skill-evolution-zx-example-author` as the primary candidate for further iteration.

Keep `skill-traced-evolution-zx-example-author` as a secondary line of exploration, especially if later experiments focus on:

- trace consolidation quality
- generalization across larger prompt families
- stronger models first

## Remaining Gap

The next iteration should target the unresolved `codex-mini` repo-summary failures:

- `copilot-sdk-repo-summary`
- `pi-mono-repo-summary`

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

`skill-evolution-zx-example-author` remains the most promising skill variant for benchmark performance.

For provider readiness:

- `pi-mono-repo-summary` is the closer of the two repo-summary paths because it scaffolds, installs, and typechecks
- `copilot-sdk-repo-summary` is still blocked by SDK compatibility issues and should not yet be treated as production-ready
