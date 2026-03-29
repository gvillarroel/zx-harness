# Issue

`gh repo create` in `cli/cli` v2.88.1 still uses `survey/v2` for the interactive flow, and the bad rendering happens in the exact `Select -> Input -> Confirm` sequence used by `repo create`, not in repo-creation business logic.

Most likely root cause: Windows-specific cursor control inside `survey` is a poor fit for modern Windows terminal stacks such as Windows Terminal and Alacritty. `gh` calls `Prompter.Select("What would you like to do?")`, then `Prompter.Input("Repository name")`, then more confirms/selects in `pkg/cmd/repo/create/create.go`. The symptom matches a redraw/erase failure between prompts.

Strong code clue: in `survey` v2.3.7, `Input.Prompt()` calls `cursor.Up(1)` before re-rendering the answered line, and `Renderer.resetPrompt()` repeatedly calls `PreviousLine(1)` plus `EraseLine(...)`. On Windows, those operations are implemented with Win32 console APIs in `terminal/cursor_windows.go` and `terminal/display_windows.go`, not ANSI. That is a plausible mismatch for ConPTY-backed terminals.

Inference: this looks more like a dependency/platform integration bug than a `gh repo create` command bug.

# Repository Findings

`gh repo create` interactive mode is in `https://github.com/cli/cli/blob/v2.88.1/pkg/cmd/repo/create/create.go`. The command only sequences prompts:

- `Select("What would you like to do?")`
- `Input("Repository name", ...)`
- `Input("Description", ...)`
- `Select("Visibility", ...)`
- several `Confirm(...)`

No command-specific cursor manipulation was found there.

`cli/cli` v2.88.1 depends on `github.com/AlecAivazis/survey/v2 v2.3.7` in `https://github.com/cli/cli/blob/v2.88.1/go.mod`. It also already carries Charmbracelet prompt dependencies (`huh`, `bubbletea`, `bubbles`), so replacing or bypassing `survey` is technically plausible.

Local repo inspection was attempted first, but the shell/file-edit runner failed to start in this workspace, so I could not inspect or save local artifacts.

# External Findings

`survey` v2.3.7 is archived and effectively unmaintained. Its README says the project is no longer maintained and suggests Bubble Tea as an alternative. That makes an upstream fix path weak.

`survey`'s Windows renderer uses console APIs, not ANSI:

- `https://github.com/AlecAivazis/survey/blob/v2.3.7/terminal/cursor_windows.go`
- `https://github.com/AlecAivazis/survey/blob/v2.3.7/terminal/display_windows.go`
- `https://github.com/AlecAivazis/survey/blob/v2.3.7/terminal/output_windows.go`

The redraw path is exactly where the bug would show:

- `https://github.com/AlecAivazis/survey/blob/v2.3.7/input.go`: `Input.Prompt()` reads a line, then does `cursor.Up(1)`, then cleanup/render.
- `https://github.com/AlecAivazis/survey/blob/v2.3.7/renderer.go`: `resetPrompt()` does `HorizontalAbsolute(0)`, `EraseLine`, then `PreviousLine(1)` in a loop.

`survey` release `v2.3.4` already had Windows-specific fixes (`Fix Survey output on Windows`, `Add terminal.Cursor error handling on Windows`), but `gh` is already on the latest `survey` release, `v2.3.7`. So this is not a simple dependency bump.

Related upstream context supports the environment-mismatch theory:

- `https://github.com/cli/cli/issues/3526` tracks Windows support gaps and explicitly calls out uncertainty across shells and terminal emulators, including Windows Terminal and Alacritty.
- `https://github.com/alacritty/alacritty/issues/2592` reports Windows multiline rendering problems in Alacritty, with the same result in PowerShell, which is consistent with cursor/rendering incompatibilities around Windows terminal behavior.
- The provided findings for `https://github.com/cli/cli/issues/3239` and `https://github.com/cli/cli/issues/3526` reinforce that `gh` has had multiple Windows terminal-detection/output-mode edge cases before.

One especially suspicious detail in `survey`'s Windows cursor code: movement is implemented via `GetConsoleScreenBufferInfo` and `SetConsoleCursorPosition`, not by writing ANSI cursor sequences, even though modern Windows terminals commonly sit behind ConPTY. That increases the chance of stale cursor-location assumptions across terminal hosts.

# Open Questions

Does a minimal standalone `survey` program that does `Select` then `Input` reproduce the same duplicate-line output in Windows Terminal and Alacritty? If yes, this should be treated as a `survey` defect or incompatibility, not a `gh` command bug.

Does `gh` wrap `survey` in any custom prompter code that alters stdio or cursor state before these calls? I did not isolate that wrapper in this pass.

Is the bug specific to ConPTY-backed terminals, or does classic `conhost.exe` reproduce too? That would help decide whether `gh` needs terminal-environment gating.

# Suggested Next Steps

Build a minimal repro outside `gh`: one `survey.Select`, one `survey.Input`, one `survey.Confirm`. Test it on:

- Windows Terminal
- Alacritty on Windows
- classic `conhost.exe`

If the minimal repro fails, stop treating this as `repo create`-specific. The likely fix options are:

- patch/fork `survey` inside `gh`
- migrate `gh` prompts off `survey`
- add a Windows-terminal-specific fallback prompt mode that avoids in-place redraw

If the minimal repro does not fail, inspect `gh`'s prompter wrapper and stdio initialization next. Focus on whether `survey` receives transformed handles or terminal state that breaks Win32 cursor APIs.

Given `survey` is archived and `cli/cli` already carries Charmbracelet prompt dependencies, migration away from `survey` is the most durable fix path if this affects more than one command.

# Sources

- https://github.com/cli/cli/issues/13054
- https://github.com/cli/cli/issues/3526
- https://github.com/alacritty/alacritty/issues/2592
- https://github.com/cli/cli/issues/3239
- https://github.com/cli/cli/blob/v2.88.1/pkg/cmd/repo/create/create.go
- https://github.com/cli/cli/blob/v2.88.1/go.mod
- https://github.com/AlecAivazis/survey/blob/v2.3.7/input.go
- https://github.com/AlecAivazis/survey/blob/v2.3.7/renderer.go
- https://github.com/AlecAivazis/survey/blob/v2.3.7/terminal/cursor_windows.go
- https://github.com/AlecAivazis/survey/blob/v2.3.7/terminal/display_windows.go
- https://github.com/AlecAivazis/survey/blob/v2.3.7/terminal/output_windows.go
- https://github.com/AlecAivazis/survey/releases
- Attempted local inspection command `Get-ChildItem -Force`: not useful because the shell runner failed to start in this workspace
- Attempted local inspection command `Get-Content SPEC.md`: not useful because the shell runner failed to start in this workspace