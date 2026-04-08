# Setup

## Goal

Get one example running with explicit local prerequisites.

## Base Tools

Install these first:

- `node`
- `npm`
- `git`
- `zx`

Install `zx` with one of:

```bash
npm install -g zx
```

```bash
pnpm add -g zx
```

## Extra CLIs

Some examples also require:

- `gh`
- `copilot`
- `codex`
- `acli`

Auth is example-specific. Verify each CLI before use.

## First Checks

```bash
node --version
npm --version
git --version
zx --version
```

## First Run

Start with:

```bash
zx examples/hello-world/index.mjs
```

Then:

```bash
zx examples/hello-name/index.mjs
```

## Package-Backed Examples

Some examples keep their own `package.json`. Install dependencies inside that example folder.

```bash
cd examples/copilot-sdk-repo-summary
npm install
zx index.mjs https://github.com/github/copilot-sdk/tree/main/nodejs
```

```bash
cd examples/pi-mono-repo-summary
npm install
zx index.mjs https://github.com/badlogic/pi-mono
```

## Platform Notes

- on Linux and macOS, run examples with your normal shell setup
- on Windows, some examples set `$.shell = "bash.exe"` and need `bash.exe` on `PATH`
- use [windows.md](windows.md) for Windows and WSL details
