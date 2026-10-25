---
name: aster-computer-use
description: >-
  Drives the GUI of a visible local app window through `aster computer`: accessibility
  tree, clicks, typing, menus, dialogs, and screenshots in native apps and external
  browser windows (Chrome, Edge, Safari) or webviews. Prefer a programmatic path
  (shell, filesystem, git, HTTP, existing CLIs) whenever it can complete the task.
  Use only when a visible window needs GUI control those cannot reach. Do not use
  for Aster's embedded browser (`aster-cli`).
---

# Computer Use

This discovery stub loads the version-matched guide from the Aster executable used for this session.

## Resolve the CLI for this session

Choose the executable once and reuse it for every later command:

- If the `ORCA_CLI_COMMAND` environment variable is set, use its value. Aster exports this
  for managed WSL sessions.
- Otherwise, in a dev checkout whose session exposes `ORCA_DEV_REPO_ROOT`, use `aster-dev`.
- Otherwise, use `aster` (the same name on macOS, Linux, and Windows). Never substitute a
  similarly named command from another app.

Below, `ASTER` is a placeholder for the executable you resolved. Substitute it before
running anything; do not create a shell variable or run `ASTER` literally. This works the
same way in POSIX shells, PowerShell, and cmd.exe.

If the selected executable cannot run, report its exact error and stop. Do not fall through
to another executable, which could silently target a different Aster build.

## Load the version-matched guide before running Aster commands

```text
ASTER skills get aster-computer-use
```

Prefer `--json`. Use the selected executable's `--help` for commands or flags the guide does
not cover. If a command reports that Aster is not running, start it with `ASTER open --json`
and retry. If it fails with `runtime_access_denied`, your sandbox blocked the connection:
re-run it with escalated permissions, and do not run `ASTER open` or restart Aster. If
`skills get` is unknown, explain that updating Aster restores the guide; use `--help` for
read-only discovery and do not guess unsupported commands.
