# ADR 0017: Bind Prompt Solver Skill Provenance

## Status

Accepted

## Decision

`run-terminal-bench.mjs` declares its own skill root in every Harbor agent config.

## Rationale

`PYTHONPATH` selects the custom agent implementation but does not create Harbor skill provenance. An
explicit `skills` entry both injects the compiler contract into the task image and binds its source and
digest in Harbor job and trial locks. Unlocked results remain diagnostic and cannot select or promote a
candidate.
