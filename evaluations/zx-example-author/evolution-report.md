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
