---
adr: "0008"
title: "ADR 0008: Discover Installed Topic Harnesses Through Safe Presets"
summary: "Provide opt-in Codex, Copilot, pi, and OpenCode presets plus probe-only discovery and safe Windows launchers."
status: "Superseded"
superseded_by: "0009"
date: "2026-07-23"
product: "zx-harness"
owner: "Platform Architecture"
area: "Knowledge Workflows"
tags:
  - harnesses
  - presets
  - windows
  - discovery
---

# ADR 0008: Discover Installed Topic Harnesses Through Safe Presets

## Status

Superseded by ADR 0009.

## Context

ADR 0007 accepts arbitrary command adapters, but requiring users to reconstruct every installed
agent CLI invocation makes portability theoretical.

## Decision

Add non-interactive presets for Codex, Copilot, pi, and OpenCode. Explicit `--harness <id>` needs no
config entry. `--auto-harness`, `--harness auto`, or `processor.autoDiscover` probes presets in
stable order. Discovery remains opt-in because a selected harness may consume credits.

Add `--probe-harnesses` to check versions and required non-interactive flags without inference. On
Windows, prefer PowerShell shims or native executables and pass all values as process arguments.
Never build a shell command string; reject a `.cmd`-only adapter. Preserve ADR 0007's arbitrary
command contract.

## Consequences

Positive:

- installed common harnesses work without custom wrappers
- availability can be audited without inference
- npm PowerShell shims work safely on Windows
- future harnesses still use the universal adapter

Negative:

- preset flags require maintenance as CLIs evolve
- automatic selection must be enabled explicitly
