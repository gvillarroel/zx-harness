# ADR 0042: Count unique context paths before ranking

- Status: accepted
- Date: 2026-09-04

## Decision

Preserve declared TF-IDF root priority and count each resolved path once before applying the file cap
or computing document frequencies. Traverse directories depth-first in ascending UTF-8 byte order;
use the same byte order for equal-score output paths.

## Consequences

- Repeated or overlapping roots cannot duplicate evidence or displace distinct files from the cap.
- Capped membership and score ties do not depend on filesystem enumeration or locale.
- Query precedence, scoring, filtering, safety checks, gates, and agent behavior remain unchanged.
- G012 passed paired development 15/15 versus G011 at 12/15 and fresh independent validation 4/4
  versus 1/4, without protected-metric regressions. These are deterministic contract results.
- See the [published study](../../docs/evaluations/studies/zx-workflow-author-g012-retrieval-20260904/publication/index.md).
