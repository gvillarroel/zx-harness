---
adr: "0020"
title: "ADR 0020: Route Generated Entrypoints to Selected Runtime Skills"
summary: "Let a generated zx entrypoint invoke one digest-bound executable skill selected from the exact prompt."
status: "Accepted"
date: "2026-08-25"
product: "zx-prompt-solver"
owner: "Evaluation Engineering"
area: "Prompt Compilation"
tags:
  - skills
  - routing
  - runtime
  - harbor
---

# ADR 0020: Route Generated Entrypoints to Selected Runtime Skills

## Context

Prompt guidance alone cannot reliably reproduce exact domain algorithms within constrained one-shot
output ceilings. The prompt-only boundary still requires the generated `solve.mjs` to be Harbor's sole
executed entrypoint.

## Decision

Permit a catalog entry to declare one digest-bound executable domain skill. When deterministic routing
selects it, select it exclusively. Instruct the model to emit an empty payload and a small generated
entrypoint that invokes the exact helper beneath `ZX_PROMPT_SKILL_ROOT`.

Bind the catalog, skill, helper, and assets to the frozen Harbor candidate. Validate their digests and
invariants before evaluation. The generator still receives only the exact task prompt plus fixed
candidate instructions, makes one tool-free inference, and cannot observe task files or verifier output.
Harbor still launches only the generated entrypoint; the helper is its declared implementation
dependency.

Do not publish task-derived runtime assets. G017 selected candidate
`68d991c2f9b3e4e53ebf8863ac688ed766bb41ffb79d448dfe5ac63278260dc5`, then passed native
development and one-way independent validation at reward 1.0 with all verifier gates at 1. The
publishable bundle retains only the generic compact-topic runtime exercised by validation; private
task-specific candidates and assets remain evaluation evidence.

## Consequences

- Small Luna generations can reuse reviewed exact implementations without a second inference.
- Runtime behavior becomes candidate-specific and must remain digest-sealed and auditable.
- A selected executable skill has greater authority than advisory guidance, so exclusive routing and
  strict path validation are mandatory.
