# Topic Knowledge Workflow

Collect one topic from arXiv and any configured `know` sources, process only unseen content hashes,
validate an Open Knowledge Format library, and update its index.

## Prerequisites

- Node.js 22+
- `know`
- Python 3.11+
- a local copy of the `open-knowledge-format` skill with its requirements installed

## Run

Edit `knowledge.config.json`, then:

```bash
npm install
npm run dry-run
npm start -- --okf-skill /path/to/open-knowledge-format
```

Override the topic without editing the config:

```bash
npm start -- --topic "graph retrieval augmented generation" \
  --okf-skill /path/to/open-knowledge-format
```

Each topic is isolated under `topics/<topic-slug>/`. Repeated runs synchronize every configured
source but send only new content digests through OKF publication.

## Harnesses

Built-in presets require no adapter configuration:

| ID | Harness |
| --- | --- |
| `codex` | OpenAI Codex CLI |
| `copilot` | GitHub Copilot CLI |
| `pi` | pi coding agent |
| `opencode` | OpenCode CLI |

Probe versions and required non-interactive flags without invoking a model:

```bash
npm run probe-harnesses
```

Select one explicitly or opt into first-available discovery:

```bash
npm start -- --harness codex --okf-skill /path/to/open-knowledge-format
npm start -- --auto-harness --okf-skill /path/to/open-knowledge-format
```

`processor.autoDiscover: true` is the persistent equivalent of `--auto-harness`. Discovery is
opt-in so an installed model cannot incur work unexpectedly. `--harness auto` enables discovery and
requires at least one available preset.

Configure any non-interactive harness CLI or SDK wrapper as a command:

```json
{
  "processor": {
    "required": true,
    "harnesses": [
      {
        "id": "preferred",
        "command": "my-harness-adapter",
        "probeArgs": ["--version"],
        "args": ["--batch", "{batch}", "--candidate", "{candidate}", "--prompt", "{prompt}"]
      }
    ]
  }
}
```

The first passing probe runs. `--harness <id>` selects one explicitly. Adapters receive `{batch}`,
`{candidate}`, `{sourceRoot}`, `{prompt}`, `{promptText}`, `{topic}`, `{topicSlug}`, and `{runId}`
placeholders plus equivalent `TOPIC_KNOWLEDGE_*` environment variables. They may edit only pending
concepts or add derived concepts inside the candidate. Set `stdoutPath` when stdout is the complete
OKF document instead.

The workflow rejects edits to prior concepts, rebuilds `index.md`, runs the configured OKF validator,
and only then publishes. If `required` is false and no harness is available, validated passthrough is
used. On Windows, executable and PowerShell shims are resolved without shell command strings.
