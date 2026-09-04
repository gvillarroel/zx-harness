# ADR 0039: Freeze case-level reward schemas

- Status: accepted
- Date: 2026-09-04

## Decision

Before development execution, bind each case to its exact expected reward-key set. Require `reward`
for every case and exact pairwise schema equality between candidate arms. Preserve every declared
finite numeric metric; do not reject a valid auxiliary key merely because it is absent from a global
shortlist.

A closed global allowlist is valid only when it equals the digest-bound union of all case schemas.
Schema drift, missing required keys, unequal arm schemas, or non-finite values stop the study before
validation release. Never amend the schema contract after observing candidate results.

V8 remains rejected. V9 starts a fresh ledger, freezes this corrected development contract before any
candidate job, and reruns selection. The unused V8 validation and holdout cohorts may be registered in
V9 only if their digests and custody remain unchanged and neither cohort has been released or run.

## Consequences

- Heterogeneous historical metrics remain protected without false rejection by an incomplete union.
- Pairwise fairness and case-specific verifier authority are independently checkable.
- V8's 10/12 to 12/12 development gain remains descriptive and cannot authorize promotion.
- V9 must pass development selection before opening validation or holdout.
