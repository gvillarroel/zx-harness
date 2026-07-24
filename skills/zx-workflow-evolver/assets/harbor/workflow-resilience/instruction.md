# Build a resilient zx workflow

Create `/app/workflow.mjs`.

Interface:

```bash
node /app/workflow.mjs --root <project-directory> --fixture <responses.json>
```

The project contains `workflow.config.json`, a query file, corpus roots, and a mutation target. The
fixture supplies deterministic harness responses for offline evaluation.

Requirements:

- start with `#!/usr/bin/env zx`
- use deterministic local TF-IDF to rank corpus files before the harness stage
- enforce configured file, per-file byte, total context byte, and top-result caps
- route the first attempt to the configured fast model and later attempts to the strong model
- validate candidates as JSON containing non-empty `summary`, `risk`, `tests`, and `patch`
- feed exact, redacted gate diagnostics into the next attempt
- stage candidates; publish output only after its gate passes
- snapshot the declared target and restore its exact bytes after a terminal post-apply gate failure
- reject absolute paths and traversal outside the project root
- write deterministic `events.jsonl`, `context.json`, and `manifest.json` under
  `.zx-evolution/<fixture-run-id>/`
- never log fixture credentials or the complete process environment
- exit nonzero on invalid input or terminal failure

Use only local runtime dependencies. Do not read `/tests`.
