# pi-mono-repo-summary

Summarize a repository with the pi-mono SDK.

The flow is:

1. map the full tree
2. summarize files in pairs
3. merge summaries in pairs until one root summary remains

## Install

```bash
cd examples/pi-mono-repo-summary
npm install
```

## Run

```bash
zx examples/pi-mono-repo-summary/index.mjs https://github.com/badlogic/pi-mono
```

Optional env vars:

- `PI_MONO_REPO_SUMMARY_PROVIDER` default `github-copilot` or `openai-codex` when `~/.pi/agent/auth.json` exists, else `openai`
- `PI_MONO_REPO_SUMMARY_MODEL` default `gpt-5.4-mini` for OAuth providers, else `gpt-5-mini`
- `PI_MONO_REPO_SUMMARY_REASONING` default `low`
- `PI_MONO_REPO_SUMMARY_MAX_BYTES` default `6000`
- `PI_MONO_REPO_SUMMARY_CONCURRENCY` default `4`
- `PI_MONO_REPO_SUMMARY_TIMEOUT_MS` default `900000`
- `PI_MONO_REPO_SUMMARY_API_KEY` overrides auth
- Provider auth also uses `~/.pi/agent/auth.json` when present
