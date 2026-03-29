# copilot-sdk-repo-summary

Summarize a repository with the Copilot SDK.

The flow is:

1. map the full tree
2. summarize files in pairs
3. merge summaries in pairs until one root summary remains

## Install

```bash
cd examples/copilot-sdk-repo-summary
npm install
```

## Run

```bash
zx examples/copilot-sdk-repo-summary/index.mjs https://github.com/github/copilot-sdk/tree/main/nodejs
```

Optional env vars:

- `COPILOT_REPO_SUMMARY_MODEL` default `gpt-5-mini`
- `COPILOT_REPO_SUMMARY_REASONING` default `low`
- `COPILOT_REPO_SUMMARY_MAX_BYTES` default `6000`
- `COPILOT_REPO_SUMMARY_CONCURRENCY` default `4`
- `COPILOT_REPO_SUMMARY_TIMEOUT_MS` default `900000`
