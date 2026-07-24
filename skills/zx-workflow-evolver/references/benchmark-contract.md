# Benchmark Contract

## Cohorts

Use at least three task families:

- development: exposes actionable diagnostics for repair
- validation: selects among candidates without supplying new mutations
- holdout: remains unread until one candidate is selected

Do not place byte-identical tasks or renamed fixtures across cohorts. Vary repository shape, failure
mode, and acceptance evidence.

## Required Dimensions

Every workflow benchmark must score numeric dimensions before aggregating `reward`:

| Metric | Evidence |
| --- | --- |
| functional | accepted output and target state match the contract |
| resilience | failed gates retry with feedback; terminal failure restores state |
| efficiency | static reduction precedes the harness; files and bytes are capped |
| security | paths stay inside the root; logs redact credentials |
| determinism | fixed inputs and fixtures produce identical artifacts |

Keep a metric protected when optimization must not trade it away.

## Repeatability

Pin Harbor, base images, runtime dependencies, agent version, model, attempts, and task digests.
Disable network during trials when the environment supports it; otherwise reject network use in the
verifier and record the limitation. Seed all fixture responses. Use unique job names and preserve
`config.json`, `lock.json`, job and trial `result.json`, trajectory, verifier rewards, and
diagnostics.

## Failure Semantics

- A verifier reward below the threshold is a product failure.
- An agent, environment, timeout, authentication, or verifier exception is an execution error.
- Missing rewards, incomplete trials, or mismatched task checksums invalidate comparison.
- Never replace a failed or missing reward with zero merely to make an aggregate computable.

## Bundled Probe

`assets/harbor/workflow-resilience` is one complex smoke task, not a complete evolution cohort. Its
hidden verifier runs independent retry, rollback, context, confinement, redaction, and determinism
cases. Copy its structure, not its fixture answers, when building development, validation, and
holdout task families for a real script.
