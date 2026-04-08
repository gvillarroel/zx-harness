# Development Guide

## Purpose

This guide explains how to extend `zx-harness` without breaking its shape.

## Before Adding Work

Check:

1. is this best expressed as an example
2. can it stay isolated inside one folder
3. can required runtime checks stay explicit
4. is the smallest useful shape enough

If not, the change likely does not fit the repository yet.

## Add A Runnable Example

Every runnable example should:

- live in its own folder under `examples/`
- use `index.mjs` as the entrypoint
- validate required binaries before real work
- keep prompts, helpers, package files, and outputs local
- fail with actionable messages
- keep output-facing text in English

## Preferred Shapes

Choose the smallest shape that works:

1. thin `zx` wrapper
2. `zx` wrapper plus local helper files
3. `zx` wrapper plus local package and TypeScript helper

## Change Workflow

1. read [spec.md](spec.md)
2. inspect a similar example
3. keep the new work local and small
4. document install and run steps in [examples.md](examples.md)
5. validate manually when possible

## Skills And Evaluations

Use `skills/` for repeatable authoring guidance.

Use `evaluations/` for evidence, comparison, and iteration history.

Do not move core example behavior into the evaluation layer.

## Validation

At minimum:

1. run the changed example manually when possible
2. verify CLI checks fail clearly when dependencies are missing
3. verify changed scripts parse
4. update docs when behavior changes

Useful checks:

```bash
node --check examples/<name>/index.mjs
node --check skills/zx-example-author/scripts/orchestrate-example.mjs
```

Package-backed examples need local dependencies first:

```bash
cd examples/<name>
npm install
zx index.mjs <args>
```

## Documentation Rules

Update:

- [README.md](README.md) when doc navigation changes
- [examples.md](examples.md) when an example is added or changed
- [architecture.md](architecture.md) when the repository model changes
- [spec.md](spec.md) when the contract changes

## Writing Style

- keep sections short
- prefer concrete commands
- use tables for reference data
- avoid filler
- keep the docs usable without reading files outside `docs/`
