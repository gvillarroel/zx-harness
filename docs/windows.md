# Windows Setup

## Why

Several examples set `$.shell = "bash.exe"`.

That keeps the shell model aligned with Windows plus WSL-backed Bash.

## Examples That Need This

- `hello-world`
- `hello-name`
- `hello-cop`

## Recommended Setup

Run PowerShell as Administrator:

```powershell
wsl --install -d Ubuntu-24.04
```

Install common tools:

- `node`
- `npm`
- `zx`
- `git`

Install example-specific CLIs as needed:

- `gh`
- `copilot`
- `codex`
- `acli`

## Quick Checks

```powershell
bash.exe --version
node --version
npm --version
git --version
```

## First Run

Verify the smallest example:

```powershell
zx examples/hello-world/index.mjs
```

## Notes

- if an example sets `$.shell = "bash.exe"`, `bash.exe` must be on `PATH`
- package-backed examples still install dependencies inside their own example folder
- provider CLIs should be installed and authenticated before running their examples
