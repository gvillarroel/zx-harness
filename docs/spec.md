# Repository Contract

## Summary

`zx-harness` defines a lightweight harness model for code-assistance workflows built with scripting-first tools.

The repository favors small, inspectable examples over framework-heavy abstractions.

## Target Stack

- modern Node.js modules or TypeScript for orchestration
- `zx` for entry scripts
- shell commands for explicit execution stages
- CLI-based agent SDKs as execution backends

## Repository Shape

| Path | Role |
| --- | --- |
| `examples/` | Runnable isolated examples |
| `skills/` | Skills that help agents build examples in this style |
| `evaluations/` | Evaluation assets, reports, and evolution logs |
| `docs/` | Project documentation |

## Example Contract

Every example under `examples/` must follow these rules:

- each example lives in its own folder
- `index.mjs` is the entrypoint for runnable examples
- the shebang targets `zx`
- prompts, hooks, helpers, and local packages stay inside the example folder
- `index.mjs` validates required external CLIs before real work
- failure states are explicit and actionable
- output-facing text is written in English

## Required Baseline Examples

The repository baseline includes these runnable examples:

- `examples/hello-world`
- `examples/hello-name`
- `examples/gh-involved-repos`
- `examples/hello-cop`

## Delivery Priorities

The repository should prioritize:

1. a minimal and coherent structure
2. runnable baseline examples
3. setup docs, especially for Windows and WSL-backed shells
4. skills and evaluations only after the example contract is stable

## Supported SDK Direction

The current target SDK families are:

- Copilot CLI SDK
- PI Mono CLI SDK
- Opencode CLI SDK
