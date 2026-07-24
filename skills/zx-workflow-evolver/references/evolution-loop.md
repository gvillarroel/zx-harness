# Evolution Loop

## Freeze

Copy the baseline into a fresh run directory and record SHA-256 for the script, plan, lockfile, and
task set. Record `harbor --version`. Refuse a dirty or changing baseline during the run.

## Measure

Run baseline attempts first. Require terminal Harbor jobs, complete rewards, identical task names
and checksums, identical agent/model cells, and no execution errors.

## Diagnose

Use development trajectories and verifier diagnostics to identify one bottleneck:

1. correctness or unsafe state
2. missing or weak gate evidence
3. excess context or calls
4. unnecessary retry or model escalation
5. nondeterministic ordering or artifacts

State a falsifiable hypothesis, the protected metrics, and the expected reward or usage change.

## Mutate

Create a new candidate from the frozen baseline. Change the smallest behavior that can test the
hypothesis. Do not edit task instructions, fixtures, verifiers, reward thresholds, or holdout data.

## Select

Evaluate candidates on development, then validation. Keep Pareto candidates when one improves
quality and another improves tokens or latency without a clear safe winner. Select exactly one
before opening holdout evidence.

## Gate

Run baseline and selected candidate with identical holdout attempts. Promote only if:

- mean reward meets the declared minimum gain
- every protected metric is non-regressing
- no task-family mean regresses
- candidate execution errors are zero
- provenance and task locks match except for the intended treatment

If reward ties, accept an efficiency win only when its token or latency confidence is credible and
all quality metrics remain equal.
