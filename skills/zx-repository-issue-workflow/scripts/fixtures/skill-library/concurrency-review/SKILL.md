---
name: concurrency-review
description: Analyze queue races, ordering, locking, transactions, and cross-cutting concurrent state before implementing a verified repair.
---

# Concurrency Review

Identify the state owner, ordering invariant, failure interleaving, and deterministic reproduction.
Prefer one explicit serialization boundary and verify both ordinary and overlapping operations.

