---
name: security-audit-runtime
description: Run a digest-bound offline Trivy dependency audit and write a filtered HIGH/CRITICAL RFC 4180 CSV. Use for lockfile vulnerability prompts with Trivy and a fixed local database.
---

# Security Audit Runtime

Do not synthesize the scanner or CSV logic. Return one compact wrapper around the reviewed helper.

`skill_markdown`:

```text
---
name: generated-terminal-solver
description: Run the selected offline security audit runtime.
---

# Strategy

Invoke the digest-bound runtime once with the required paths.
```

`solve_mjs` shape:

```javascript
#!/usr/bin/env zx
import{spawnSync as s}from'node:child_process';const p=process.env.ZX_PROMPT_SKILL_ROOT+'/references/solver-skills/security-audit-runtime/scripts/audit.mjs',r=s(process.execPath,[p,'/root/package-lock.json','/root/security_audit.csv','/root/trivy-cache'],{stdio:'inherit'});if(r.error||r.signal||r.status)throw r.error||Error(r.signal||r.status)
```

Pass only the prompt's input path, output path, and existing offline Trivy cache path. Do not add scan,
parsing, CSV, helper, model, or evaluation logic. The generated bundle still contains one script.
