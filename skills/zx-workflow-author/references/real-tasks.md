# Real Task Probes

These open issues from `gvillarroel` repositories exercise distinct workflow shapes.

## gcp-radar

- [#1 Improve Step 3 and Step 4 selection/crawl logic](https://github.com/gvillarroel/gcp-radar/issues/1):
  rank feature-to-document gaps with TF-IDF, ask a harness to propose better seeds and budgets, run
  targeted stages, then gate on corpus health and Step 6 coverage.
- [#24 Add a full-catalog run manifest](https://github.com/gvillarroel/gcp-radar/issues/24):
  collect commits, controls, counts, and hashes statically; use a model only to explain unknown
  historical fields; gate the result against a versioned schema.
- [#23 Add a repository doctor command](https://github.com/gvillarroel/gcp-radar/issues/23):
  probe CLIs and environment without model calls; use a harness only to draft remediation from the
  reduced readiness report; gate command output in clean and missing-tool fixtures.
- [#22 Define Step 07 promotion](https://github.com/gvillarroel/gcp-radar/issues/22):
  create a dry-run promotion plan, gate provenance and quality status, then promote only eligible
  artifacts.

## knowledge

- [#3 Add `know doctor`](https://github.com/gvillarroel/knowledge/issues/3):
  inspect Python, Playwright, credentials, and writable storage without exposing secrets.
- [#6 Add export redaction safeguards](https://github.com/gvillarroel/knowledge/issues/6):
  scan with deterministic patterns, block archives on findings, and test positive and negative
  fixtures. A model may explain remediation but must never receive secret values.
- [#7 Add deterministic export manifests](https://github.com/gvillarroel/knowledge/issues/7):
  hash exports twice and gate equality while excluding documented volatile fields.
- [#12 Generate command reference](https://github.com/gvillarroel/knowledge/issues/12):
  extract CLI definitions, generate docs, and fail when the committed reference drifts.

Prefer #1 as the full static → harness → gate stress test. Prefer #6 as the no-LLM safety control.
