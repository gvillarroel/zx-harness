# Topic Knowledge Workflow

Use the dedicated scaffold when one topic must collect from arXiv and other `know` sources:

```bash
node <skill-directory>/scripts/scaffold-topic-knowledge.mjs <target-directory>
```

Then edit `knowledge.config.json`, install dependencies, inspect the plan, and run:

```bash
npm install
npm run dry-run
npm start -- --okf-skill <open-knowledge-format-skill-directory>
```

## Contract

- One normalized topic slug owns `topics/<slug>/`.
- One `know` key holds all registered sources for that topic.
- `arxiv-search` discovers bounded papers, registers unseen URLs, and synchronizes them.
- Direct `arxiv`, `site`, `github-repo`, `google-releases`, and `video` sources use the same loop.
- A SHA-256 state ledger sends only unprocessed content versions to the OKF stage.
- Unchanged files are never copied or reprocessed.
- `processor.harnesses` accepts any non-interactive CLI or SDK wrapper as an argument-array command.
- Built-in `codex`, `copilot`, `pi`, and `opencode` presets provide non-interactive edit commands.
- `--auto-harness` or `processor.autoDiscover` probes built-ins in order; discovery is opt-in.
- `--probe-harnesses` checks versions and required flags without inference or synchronization.
- Harnesses are probed in order; `--harness <id>` selects one and makes it required.
- The batch manifest, candidate, prompt, topic, and run ID are available as placeholders and
  `TOPIC_KNOWLEDGE_*` environment variables.
- A harness may edit pending concepts or add derived concepts, but prior bytes and reserved files are
  immutable.
- `stdoutPath` adapts text-only harness output into one candidate OKF document.
- The complete reserved `index.md` is rebuilt deterministically after each non-empty batch.
- Publication is staged, validated with `open-knowledge-format/scripts/validate_okf_bundle.py`, and
  promoted atomically.
- Semantic OKF projections are separate full rebuilds. Never patch a semantic snapshot incrementally.

Harness credentials must come from inherited environment variables, not config, prompts, or logs.
On Windows, resolve native executables or PowerShell shims without interpolated shell commands.
`know`, Python 3.11+, network credentials, and the Open Knowledge Format skill are explicit runtime
prerequisites. The scaffold has no dependency on this repository.
