# Topic Knowledge

Scaffold once:

```bash
node <skill-directory>/scripts/scaffold-topic-knowledge.mjs <target-directory>
cd <target-directory>
npm install
npm run codex -- "your topic"
```

Use `copilot`, `pi`, or `opencode` for a different prompt simulation. Each command accepts one
topic and owns `topics/<slug>/`.

## Contract

- `know` searches arXiv, synchronizes every enabled `sources.json` adapter, and exports Markdown.
- `git hash-object` plus a per-harness ledger selects only unseen content versions.
- `jq`, `fd`, and `rg` parse manifests and rebuild the reserved `index.md`.
- The harness receives only the fresh manifest and returns one staged concept body.
- `OPEN_KNOWLEDGE_FORMAT_SKILL` points to the external OKF skill; its validator gates promotion.
- Codex, Copilot, pi, and OpenCode have different prompts and non-interactive argument arrays.
- Any additional CLI or SDK wrapper can call `runHarness({ harness, prompt, command })`.
- Credentials remain inherited environment variables. Generated files never reference this skill.
