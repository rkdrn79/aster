---
name: aster-cli
description: >-
  Operate Aster-managed worktrees, folder contexts, terminals, repos, automations, artifacts,
  skill sharing, worktree comments, and Aster's embedded browser through the `aster` CLI. Use
  when the user says "$aster-cli", "Aster worktree", "child worktree", "spawn codex/claude in a
  worktree", "read/wait/send Aster terminal", "handoff" / "handover" / "give this to another
  agent", "Aster browser", "aster artifacts", or "share skills". Prefer it over raw git
  worktree, ad hoc PTYs, or Computer Use when Aster state is involved. Use Computer Use only
  when a visible window needs GUI control that a CLI, filesystem, or API cannot do.
---

# Aster CLI

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
ASTER skills get aster-cli
```

Prefer `--json`. Use the selected executable's `--help` for commands or flags the guide does
not cover. If a command reports that Aster is not running, start it with `ASTER open --json`
and retry. If it fails with `runtime_access_denied`, your sandbox blocked the connection:
re-run it with escalated permissions, and do not run `ASTER open` or restart Aster. If
`skills get` is unknown, explain that updating Aster restores the guide; use `--help` for
read-only discovery and do not guess unsupported commands.
