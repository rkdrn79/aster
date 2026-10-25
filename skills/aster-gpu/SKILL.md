---
name: aster-gpu
description: >-
  Run GPU work on SLURM clusters through the user's per-project GPU budget with `aster gpu status`
  and `aster gpu submit`, tie each job to its research Run, and sleep until the Run needs you with
  `aster research watch` and `aster research status`. Use before launching any training, evaluation
  or other GPU job on an SSH host the user reads in Aster > Compute (for example my-cluster), when
  the user says "$aster-gpu", "GPU budget", "submit to SLURM", "sbatch", asks which GPUs or
  partitions are free, or asks you to wait for, monitor or check on a training Run. Prefer it over
  calling sbatch directly or polling logs so jobs count toward the right project, wait held instead
  of oversubscribing the user's share, and wake you with evidence when they end, fail or stall.
---

# Aster GPU budget

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

## Load the version-matched guide before submitting GPU jobs

```text
ASTER skills get aster-gpu
```

Prefer `--json`. Use the selected executable's `--help` for commands or flags the guide does
not cover. If a command reports that Aster is not running, start it with `ASTER open --json`
and retry. If it fails with `runtime_access_denied`, your sandbox blocked the connection:
re-run it with escalated permissions, and do not run `ASTER open` or restart Aster. If
`skills get` is unknown, explain that updating Aster restores the guide; use `--help` for
read-only discovery and do not guess unsupported commands.
