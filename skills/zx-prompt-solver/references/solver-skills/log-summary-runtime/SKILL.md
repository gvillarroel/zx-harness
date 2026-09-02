---
name: log-summary-runtime
description: Run a digest-bound log severity summary across today, rolling-day, month-to-date, and total ranges. Use for dated log files that must produce a fixed ERROR/WARNING/INFO CSV.
---

# Log Summary Runtime

Do not synthesize date-window or counting logic. Return one compact wrapper around the reviewed helper.

`skill_markdown`:

```text
---
name: generated-terminal-solver
description: Run the selected dated-log summary runtime.
---

# Strategy

Invoke the digest-bound runtime once with the required paths and date.
```

`solve_mjs` shape:

```javascript
#!/usr/bin/env zx
import{spawnSync as s}from'node:child_process';const p=process.env.ZX_PROMPT_SKILL_ROOT+'/references/solver-skills/log-summary-runtime/scripts/summarize.mjs',r=s(process.execPath,[p,'/app/logs','/app/summary.csv','2025-08-12'],{stdio:'inherit'});if(r.error||r.signal||r.status)throw r.error||Error(r.signal||r.status)
```

Pass only the prompt's log directory, output path, and reference date. Do not add traversal, date,
counting, CSV, helper, model, or evaluation logic. The generated bundle still contains one script.
