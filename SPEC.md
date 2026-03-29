# zx-harness Specification

## Overview
`zx-harness` defines a lightweight harness model for code-assistance workflows built with scripting-first tools.

The current target stack is:

- TypeScript or modern Node.js modules for orchestration
- Bash for explicit shell execution stages
- CLI-based agent SDKs as execution backends

The repository should favor small, inspectable examples over framework-heavy abstractions.

## Repository Structure

- `examples/`: runnable, isolated harness examples
- `skills/`: skills that improve how agents build or extend this harness style
- `evaluations/`: evaluation assets for skills and example behavior
- `fixtures/`: stable files used by examples and evaluations
- `docs/`: supporting documentation
- `README.md`: repository entry point aligned with this specification
- `SPEC.md`: source of truth for repository scope and contracts
- `AGENTS.md`: repository-specific agent instructions
- `.gitignore`: local ignore rules when present

## Supported Agent SDKs

The harness is expected to support these CLI SDK families:

- Copilot CLI SDK
- PI Mono CLI SDK
- Opencode CLI SDK

Support may begin as documentation or examples before a shared abstraction exists.

## Example Contract

Every example inside `examples/` must follow these rules:

- Each example lives in its own folder.
- `index.mjs` is the entry point.
- shebang should be for run zx
- Prompts, hooks, and helper files must stay inside that example folder.
- Each example must be isolated: everything specific to its execution must live inside its folder.
- `index.mjs` must define which external CLIs are required and verify they are available before doing real work.
- Failure states must be explicit and actionable.
- Example files and output-facing text must be written in English.

### Required Example Set

The repository must provide these examples:

- `examples/hello-world`: print `hello world`
- `examples/hello-name`: ask for a user-provided name and print `hello <name>`
- `examples/gh-involved-repos`: list the repos that user is involved
- `examples/hello-cop`: run a prompt using copilot cli

## Current Delivery Priority

The first milestone for this repository is:

1. Keep the repository structure minimal and coherent.
2. Make the required examples runnable.
3. Document platform-specific setup, especially Windows + WSL for bash-backed examples.
4. Grow shared skills and evaluations only after the example contract is stable.
