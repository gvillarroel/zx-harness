---
adr: "0025"
title: "ADR 0025: Pin Explicit Evaluation Models"
summary: "Reject model-routing aliases and fail delivery commands on Harbor trial errors."
status: "Accepted"
date: "2026-09-02"
product: "zx-harness"
owner: "Platform Architecture"
area: "Evaluation"
tags:
  - harbor
  - models
  - provenance
---

# ADR 0025: Pin Explicit Evaluation Models

## Context

Provider routers can expose a valid alias during preflight yet have no endpoint during the trial.
Harbor 0.18.0 can then finish its command successfully while recording the only trial as errored.
Explicit models also inherited Luna's reasoning and 16,000-token profile despite having unrelated
provider capabilities.

## Decision

Keep Luna and Sol profiles unchanged. Give `--model` a provider-neutral profile: no reasoning
override and 4,096 output tokens. Require an exact provider/model route and reject routing aliases
such as `openrouter/free` and `openrouter/openrouter/auto`. Keep one call and zero retries.

After Harbor exits, read its native `result.json`. Require one settled trial and one reward. Return a
failing command when the trial errored, preserving that outcome as non-evaluable rather than score
zero. Also fail oracle delivery when its reward is not `1`; keep solver reward zero evaluable. Keep
the append-only job as evidence.

## Consequences

- Explicit model provenance remains reproducible.
- Provider-specific reasoning options cannot leak from Luna into unrelated models.
- Automation cannot mistake an all-error Harbor job for a completed evaluation.
- Verifier reward zero remains a valid evaluated failure; provider errors do not.

## Verification

The public development jobs `scout-log-summary-runtime-pathfix-20260902a` and
`scout-security-runtime-final-20260902a` each settled one exact-model trial with no error and reward
`1`. Harbor locked both to `zx-prompt-solver` at
`sha256:124c54ff4126bd30b22a520883772c68cd55507031c5896378a14af89a537a92`.
