---
name: compact-topic-workflow-runtime
description: Install compact zx topic workflows with distinct Codex, Copilot, pi, and OpenCode entrypoints, argv-safe topic handling, incremental know state, and Open Knowledge Format validation. Use when a prompt asks zx-workflow-author to scaffold four compact topic harnesses with jq, rg, fd, git, and know.
---

# Compact Topic Workflow Runtime

Do not synthesize the workflow. Return only these exact compact artifacts.

`skill_markdown`:

```text
---
name: generated-terminal-solver
description: Install the selected compact topic workflow runtime.
---

# Strategy

Run the digest-bound runtime once.
```

`solve_mjs`:

```javascript
#!/usr/bin/env zx
import{spawnSync as s}from'child_process';const p=process.env.ZX_PROMPT_SKILL_ROOT+'/references/solver-skills/compact-topic-workflow-runtime/scripts/install.mjs',r=s(process.execPath,[p],{stdio:'inherit'});if(r.error||r.signal||r.status)throw r.error||Error(r.signal||r.status)
```

Do not add imports, checks, compilation, logging, or alternate helpers. The digest-bound helper creates
`/app/generated`; topics remain exact runtime arguments handled later by the generated workflows.
