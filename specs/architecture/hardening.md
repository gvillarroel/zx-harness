# Hardening Configurations

## Scope

This document separates two different things:

1. The valid hardening fields supported by the current Skill Arena compare schema.
2. Runtime-native hardening examples for tools we care about, including OpenCode.

That distinction matters because OpenCode is currently relevant to this repository, but it is not a supported Skill Arena compare adapter in the local V1 schema.

## Skill Arena V1: Valid Hardening Fields

Current local schema accepts these hardening-related fields for compare variants:

```yaml
agent:
  adapter: codex | copilot-cli | pi
  executionMethod: command | sdk
  sandboxMode: read-only | workspace-write | danger-full-access
  approvalPolicy: never | on-request | on-failure | untrusted
  webSearchEnabled: true | false
  networkAccessEnabled: true | false
  reasoningEffort: none | minimal | low | medium | high | xhigh
```

Important notes:

- `copilot-cli` supports only `executionMethod: command` in the current local V1 schema.
- Skill Arena currently supports exactly these compare adapters: `codex`, `copilot-cli`, and `pi`.
- OpenCode is not currently a Skill Arena compare adapter in this repository's local schema, so its hardening examples belong in the runtime-native section below instead of `comparison.variants[*].agent`.

## Recommended Hardening Profiles

### Strict Offline Review

Use when the task is read-only and should not depend on live web or network access.

```yaml
sandboxMode: read-only
approvalPolicy: never
webSearchEnabled: false
networkAccessEnabled: false
reasoningEffort: low
```

### Controlled Workspace Edit

Use when the agent may edit files in the benchmark workspace but should stay offline.

```yaml
sandboxMode: workspace-write
approvalPolicy: never
webSearchEnabled: false
networkAccessEnabled: false
reasoningEffort: low
```

### Connected Automation

Use only when the task genuinely requires external services, remote repositories, or networked tools.

```yaml
sandboxMode: danger-full-access
approvalPolicy: never
webSearchEnabled: false
networkAccessEnabled: true
reasoningEffort: low
```

## Adapter-Specific Caveats

### Codex

- `danger-full-access` combined with `networkAccessEnabled: false` is not guaranteed for command execution in the local Skill Arena Codex provider.
- Prefer `read-only` or `workspace-write` when you need reproducible offline behavior.

### Copilot CLI

- Skill Arena maps sandbox, web, network, and approval settings on a best-effort basis for `copilot-cli`.
- Current local provider logic explicitly reports `sandboxMode` and `webSearchEnabled` as unsupported in common cases.
- Treat Copilot hardening values as requested policy, not fully enforceable isolation semantics.

### Pi

- Pi participates in the common Skill Arena hardening schema without the special caveats currently documented for Copilot CLI.
- For the first implementation passes in this repository, prefer the same strict defaults used for Codex read-only benchmarks.

## Valid Skill Arena Examples

### Codex: Strict Offline Review

```yaml
agent:
  adapter: codex
  model: gpt-5.1-codex-mini
  executionMethod: command
  commandPath: codex
  sandboxMode: read-only
  approvalPolicy: never
  webSearchEnabled: false
  networkAccessEnabled: false
  reasoningEffort: low
  additionalDirectories: []
  cliEnv: {}
  config: {}
```

### Copilot CLI: Controlled Workspace Edit

```yaml
agent:
  adapter: copilot-cli
  model: gpt-5.4-mini
  executionMethod: command
  commandPath: copilot
  sandboxMode: workspace-write
  approvalPolicy: never
  webSearchEnabled: false
  networkAccessEnabled: false
  reasoningEffort: low
  additionalDirectories: []
  cliEnv: {}
  config: {}
```

### Pi: Strict Offline Review

```yaml
agent:
  adapter: pi
  model: github-copilot/gpt-5-mini
  executionMethod: command
  commandPath: pi
  sandboxMode: read-only
  approvalPolicy: never
  webSearchEnabled: false
  networkAccessEnabled: false
  reasoningEffort: low
  additionalDirectories: []
  cliEnv: {}
  config: {}
```

## OpenCode: Runtime-Native Hardening Examples

OpenCode should currently be documented as a runtime-native integration target, not as a Skill Arena compare adapter in this repository.

### OpenCode Built-In Read-Only Option

OpenCode ships with a built-in `plan` agent that is explicitly described as:

- read-only
- denying file edits by default
- asking permission before running bash commands

This is the safest built-in baseline when the task is analysis or planning only.

### OpenCode Custom Agent: No Bash

Valid documentation example shape from the official agent docs:

```md
---
description: Writes and maintains project documentation
mode: subagent
tools:
  bash: false
---

You are a technical writer. Create clear, comprehensive documentation.
```

### OpenCode Custom Agent: Security Review Without Edits

Valid documentation example shape from the official agent docs:

```md
---
description: Performs security audits and identifies vulnerabilities
mode: subagent
tools:
  write: false
  edit: false
---

You are a security expert. Focus on identifying potential security issues.
```

### OpenCode Config-Level Provider Restriction

Valid official config example shape:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "enabled_providers": ["anthropic", "openai"]
}
```

This is not sandboxing by itself, but it is a valid hardening move when you want to narrow the provider surface instead of leaving every configured provider available.

## Recommended Repository Position

For this repository:

- Treat Codex, Copilot CLI, and Pi hardening as compare-variant policy expressed in Skill Arena YAML.
- Treat OpenCode hardening as runtime-native agent and config examples until we add an explicit OpenCode adapter path.
- Prefer `read-only`, `approvalPolicy: never`, `webSearchEnabled: false`, and `networkAccessEnabled: false` as the default benchmark baseline.
- Escalate to `workspace-write` only for tasks that actually need file edits.
- Escalate to `danger-full-access` only for explicitly networked or system-integrated workflows.
