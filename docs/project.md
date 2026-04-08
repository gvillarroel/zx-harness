# Project Overview

## Summary

`zx-harness` is a small repository of inspectable `zx` examples for agent-driven CLI workflows.

The repository favors:

- small runnable examples
- explicit shell and CLI calls
- local example ownership
- low abstraction

## Goals

- provide copyable reference examples
- document one consistent harness style
- support CLI-based agent SDK workflows
- keep example behavior easy to inspect and debug

## Non-Goals

- a shared framework
- hidden orchestration layers
- central runtime registries
- broad provider coverage before the core example contract is stable

## Repository Map

| Path | Role |
| --- | --- |
| `examples/` | Runnable or in-progress example folders |
| `skills/` | Authoring guidance for this repository style |
| `evaluations/` | Skill evaluations, reports, verification assets |
| `docs/` | Self-contained human documentation |

## Working Model

### Examples are the product

This repo is centered on example folders, not on a shared runtime.

### Locality first

Prompts, helper files, package files, and temporary outputs stay inside the example folder that uses them.

### Explicit checks

Examples should verify required CLIs and fail with actionable messages before real work starts.

### Reuse later

A shared layer is justified only after multiple examples need the same stable pattern.

## Supported SDK Direction

The current target CLI SDK families are:

- Copilot CLI SDK
- PI Mono CLI SDK
- Opencode CLI SDK

Support may begin as docs or examples before a reusable abstraction exists.

## Reading Path

- use [spec.md](spec.md) for the hard contract
- use [setup.md](setup.md) for prerequisites and first-run checks
- use [architecture.md](architecture.md) for the execution model
- use [examples.md](examples.md) to choose a runnable example
- use [development.md](development.md) before adding or changing repo content
- use [windows.md](windows.md) if you run Windows-oriented examples
