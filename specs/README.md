# Specs Index

This repository starts from specs, not implementation.

## Current Documents

- [architecture/folder-structure.md](architecture/folder-structure.md): proposed repository layout and ownership boundaries
- [architecture/stage-contract.md](architecture/stage-contract.md): draft normalized execution contract for all runtimes
- [research/technology-map.md](research/technology-map.md): validated technology map and official documentation sources
- [skills/skill-suite.md](skills/skill-suite.md): initial spec for the skill group and execution model

## Immediate Goal

Define a maintainable foundation for a multi-skill harness where:

- `zx` is the orchestration and process-control layer
- `bash` is an execution target for complex shell-native tasks
- `pi-mono` is one agent runtime option
- `@github/copilot-sdk` is another agent runtime option
- skills compose these runtimes instead of hard-coding a single workflow

## Design Constraints

- Repository content is English-only
- Specs should cite primary documentation
- Runtime-agnostic orchestration must stay separate from runtime-specific adapters
- The first implementation slice should be testable without a full TUI
