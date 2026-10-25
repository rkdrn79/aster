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

# GPU jobs under the user's budget

The user sets GPU limits per SSH host in Aster > Compute: their own max GPUs on the host, and
for each project a cap and a priority (high, normal, low). Aster holds jobs that would pass a
limit (`sbatch --hold`) and, while it runs, releases them by priority and then age as GPUs free
up. SLURM stays the scheduler; Aster only decides when its own held jobs may enter the queue.

## Before submitting

1. Check the budget and what is already held:

   ```bash
   aster gpu status --json
   aster gpu status --server my-cluster
   ```

   `availableGpus` is the room left in the user's budget now. `heldJobs` lists jobs waiting for it.
   A host missing from the output has no limits; ask the user before submitting there.

2. Pick the project the work belongs to. `--project` must be one of the names listed for that
   server. If the project is missing, ask the user to set its limits in Aster > Compute rather
   than inventing one.
3. Ask the scheduler and the budget for a verdict without creating a job:

   ```bash
   aster gpu submit --server my-cluster --project my-paper \
     --workdir /scratch/me/my-paper --script scripts/train.sbatch \
     --gpus 2 --partition a6000 --time 1-00:00:00 --dry-run
   ```

## Submitting

Drop `--dry-run` to submit. Always pass `--gpus`: the budget does not read `#SBATCH` lines.

```bash
aster gpu submit --server gpu-cluster --project my-paper --workdir /home/me/my-paper \
  --run "python train.py --config configs/lora.yaml" --gpus 1 --time 4:00:00 --name lora-r16
```

- Use `--script <path>` for a batch script (relative to `--workdir`) or `--run "<command>"` to
  wrap a command; pass exactly one.
- Optional: `--partition`, `--cpus`, `--mem 64G`, `--time`, `--name`.
- The reply says whether the job started queueing or was held, and why. A held job is not an
  error: report its id and reason, and do not resubmit it or release it yourself.

## Tie the job to its Run

When the job is one attempt of a research Run (`.aster/experiments/<experiment>/runs/<run-id>/`,
or `research/experiments/...` in older projects, with a `run.json`), link it so the Run records its own job:

```bash
aster gpu submit --server my-cluster --project my-paper --workdir /scratch/me/my-paper \
  --script scripts/train.sbatch --gpus 2 --link-run lora-r16/seed-42
```

- The Run must already exist on the host under `--run-project` (default: `--workdir`). Register it
  first; the command refuses a Run without `run.json` and submits nothing.
- The job's stdout and stderr go to the Run's `train.log` (this overrides `#SBATCH --output`), and
  its comment names the Run.
- `run.json` gets a `job` block (SLURM id, state, reason) and `execution` with
  `source: aster-slurm`. Aster keeps reading `sacct` about once a minute, including after a
  restart, and writes how the job ended: completed, failed with its exit code, cancelled, timeout,
  out of memory or node failure. A launcher that recorded the process exit itself keeps its
  `execution`; the job block still updates.

## Wait for the Run instead of polling

Do not loop on `sleep`, `squeue` or `tail` while a job runs. Create a watch, report what you
started, and end your turn. Aster types the evidence into this conversation when a condition
fires, once your turn is over and your prompt is idle:

```bash
aster research watch --run lora-r16/seed-42 --on failed,nan,stall:30 --on 'log:OOM|Traceback'
aster research watch --run lora-r16/seed-42 --on 'metric:val_loss<0.3,exit' \
  --message "If it beats baseline-r8, start the r32 sweep"
```

| Condition                  | Fires when                                                              |
| -------------------------- | ----------------------------------------------------------------------- |
| `exit`                     | the Run ended in any way (run.json execution, else the SLURM job)       |
| `failed` / `succeeded`     | the Run ended that way; timeout, OOM and node failure count as failed   |
| `metric:<name><op><value>` | a metrics.jsonl row has that metric `<`, `<=`, `>` or `>=` the value    |
| `nan`                      | a metric is NaN or infinite                                             |
| `stall:<minutes>`          | the job runs but neither metrics.jsonl nor train.log grew for that long |
| `log:<regex>`              | a new train.log line matches; put it last or in its own `--on`          |

- Quote metric and log conditions for the shell. Each condition fires once. A watch on metrics
  alone still tells you when the Run ends and then closes.
- `--project` defaults to the project around the current directory, or to the project of a job
  linked with `--link-run`. Add `--server <host>` for a Run on an SSH host with no linked job.
- Local Runs are checked every 15 s and SSH Runs every 60 s. `--notify none` sends only a desktop
  and phone notification.
- `aster research watch list` shows watches and what fired; `aster research watch cancel <id>` stops
  one.

When you are woken, read the Run before acting:

```bash
aster research status --run lora-r16/seed-42 --json
```

It returns the Run's recorded execution, the SLURM job state and reason, last and best metrics,
the last log lines and the active watches.

Your turn ending is not the Run succeeding. Report a Run's outcome only from `research status`
(run.json execution or the SLURM job), and say "unknown" when neither records an end.

## Rules

- Do not call `sbatch`, `scontrol release` or `scancel` directly for work in a project that has
  GPU limits. Direct submissions still count toward the user's total and can starve their other
  projects.
- Do not cancel the user's jobs. If a held job should go away, ask the user; Aster > Compute has
  a Cancel action.
- Exit code 1 with "Not submitted" means nothing reached the cluster. Fix the argument it names
  and retry.
- Do not poll a running job in a loop. Use `aster research watch` and end your turn.
