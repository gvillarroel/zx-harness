---
adr: "0015"
title: "ADR 0015: Route Prompt Compilation Between Luna and Sol"
summary: "Default prompt compilation to GPT-5.6 Luna and expose explicit one-call Sol escalation."
status: "Accepted"
date: "2026-08-24"
product: "zx-harness"
owner: "Platform Architecture"
area: "Models"
tags:
  - gpt-5.6
  - routing
  - harbor
  - evaluation
---

# ADR 0015: Route Prompt Compilation Between Luna and Sol

## Context

Prompt compilation needs an inexpensive high-volume default, while a small set of difficult coding
tasks benefits from frontier capability. An automatic fallback after script execution would add a
second inference and invalidate the prompt-only one-call measurement.

## Decision

Use `gpt-5.6-luna` at medium reasoning as the Terminal-Bench runner default. Add `--power` to select
`gpt-5.6-sol` at max reasoning before the trial begins. Keep `--model` for explicit provider routes and
reject combining it with `--power`.

Before Luna inference, a deterministically selected executable runtime may reduce reasoning to `none`
and cap output at 192 tokens. This route depends only on the exact prompt and frozen skill catalog; it
is not a retry or post-result escalation. Explicit Sol selection retains its full power profile.

Store the canonical OpenAI model ID in Harbor's `model_name` and the provider-qualified LiteLLM route
in `generator_model_name`. Make exactly one generation call. Never retry, repair, or escalate a Luna
trial through Sol after observing its output or verifier result.

For OpenRouter routes, send effort through its native `reasoning.effort` request object. This preserves
new levels such as `max` even when LiteLLM's provider capability map lags the gateway.

## Consequences

- Routine runs use the lower-cost Luna tier.
- Reviewed runtime sectors use a smaller Luna request without weakening generic Luna tasks.
- Hard tasks can opt into Sol without changing isolation or evidence semantics.
- Luna and Sol results require separate fixed comparison profiles.
- Provider routing remains explicit while Harbor model identity stays stable.
- OpenRouter receives the selected effort without compatibility remapping.
