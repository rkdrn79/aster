---
name: aster-research-loop
description: Run a budgeted, autonomous experiment loop in an Aster research project — hypothesis, run, result, decision — with every step recorded in its loop ledger and every run launched through the Aster harness. Use when the user asks to keep iterating, tune, sweep, search, optimize a metric, run experiments until a target, or work autonomously or overnight on an experiment in a project with .aster/project.json (or an older research/project.json). Do not use for a single run (use aster-research-track) or for coding without experiments.
---

# Autonomous experiment loop in Aster

This skill adds a loop protocol on top of `aster-research-track`; follow that skill too. Every launch goes through `run exec`, and every number you put in the paper goes through `claim add`.

Run `aster research harness-path` on the machine that holds the project; it prints the
version-matched absolute path to `cli.mjs`. `H` below means its parent directory. An installed
skill's parent is not necessarily the harness. In a source checkout without the Aster CLI, the
parent of this **resolved** skill directory contains `cli.mjs`. Add `--json` when you parse
output.

## 1. Set the contract before any run

Take these from the request or ask the user. Never start an unbounded loop.

- Objective, primary metric, split, and direction.
- Budget: maximum Runs, maximum wall-clock hours, maximum parallel Runs, and a GPU policy (hosts, partitions, GPU count; on SLURM use the user's `aster gpu` budget).
- Stop rules: a target value, no improvement in K consecutive Runs, budget exhausted, or a failure that needs a human.
- What stays fixed: dataset, evaluation code, and metric definition.

Record it as the loop's objective:

```bash
node H/cli.mjs loop note --experiment <slug> --kind objective --text "Minimize val loss of LoRA on X" \
  --data '{"metric":"loss","split":"val","direction":"minimize","maxRuns":12,"maxHours":8,"maxParallel":2,"gpuPolicy":"my-cluster a6000, at most 2 GPUs","stopWhen":"loss < 0.30 or 3 Runs without improvement"}'
```

`maxRuns` and `maxHours` drive the budget that `loop show` reports. A new objective note starts a new budget.

Then read `node H/cli.mjs brief show --experiment <slug> --json`. Its `agentPolicy.proposals` decides who starts each Run:

Run `node H/cli.mjs preflight --experiment <slug> --loop --json` before the first launch and
again before each later launch. A blocker means stop and resolve the recorded contract or
budget first. A warning is a limitation to carry into the result, not a value to guess. The
check does not reserve a GPU or count a Run until a `loop note --kind run` records it, so keep
the ledger current and apply the user's compute policy at the actual launcher too.

- `budgeted`: you launch within the budget, as below.
- `approval` (the default): for each hypothesis, record `proposal add` with the exact `run exec` command (see aster-research-track) instead of launching, end your turn, and wait for Aster's approval message. Launch only an approved proposal, then record `proposal launched` and the `run` note. Record a rejection as a `decision` note with the user's reason.
- `off`: launch nothing; record a checkpoint and ask the user.

## 2. Iterate

1. Read state with `node H/cli.mjs loop show --experiment <slug> --json` (budget, open hypotheses, recent entries) and `node H/cli.mjs context --experiment <slug>` (best Runs so far). If `budget.exhausted` is true, go to the checkpoint.
2. State one falsifiable hypothesis that changes one thing: `loop note --kind hypothesis --text "<change> lowers <metric> because <reason>"`. It returns an ID such as `hypothesis-4`.
3. Launch it (under `approval`, only once its proposal is approved): `run exec --loop-preflight --experiment <slug> --name "<change>" --metric-def <metric>:<direction> -- <command>`. As soon as the harness prints the Run ref, record `loop note --kind run --run <ref> --hypothesis hypothesis-4 --text "<exact change>"` before starting another Run, even when this one is still running.
4. Wait without burning turns. If `aster research --help` lists `watch`, use `aster research watch --run <ref> --on exit --notify self` (or `--on failed`, `--on metric:<name><op><value>`, `--on stall:<minutes>`). Otherwise check `run show <ref>` at intervals that fit the expected duration.
5. When it ends, follow "When a Run ends" in aster-research-track (`organize`, `check`, `run show`, `media`, evidence-backed `quality add`, `rate add --by agent` under a rubric, one `run annotate`). Then record the result from those files, never from memory: `loop note --kind result --run <ref> --hypothesis hypothesis-4 --text "val loss 0.41 (best so far 0.39, <ref>)"`. A failed Run is a result. Read `run show <ref> --log-lines 50` before retrying anything.
6. Decide: `loop note --kind decision --hypothesis hypothesis-4 --text "<keep|discard|refine>: <why>; next: <plan>"`.
7. Check every stop rule before the next iteration.

## 3. Human checkpoints

Stop, record `loop note --kind checkpoint --text "<what you need>"`, report, and end your turn before you:

- spend beyond `maxRuns`, `maxHours`, `maxParallel`, or the GPU policy;
- change the objective, metric, dataset, or evaluation code;
- continue after three consecutive failed Runs;
- delete results, rewrite history, or change the paper's conclusions.

Continue only after the user answers, and record their answer as a `decision` note.

## 4. Parallel hypotheses

Independent hypotheses may run at once through Aster's orchestration. Load its guide first (`aster skills get aster-orchestration`) and follow it as the coordinator:

```text
aster orchestration run-create --objective "<loop objective>" --json
aster orchestration worker-start --spec "<worker spec>" --worktree new-child --name <slug>-h4 --agent claude --setup run --json
aster orchestration check --wait --types "worker_done,escalation,question" --timeout-ms 900000 --json
```

A folder workspace has no worktrees; use `--worktree current` there and keep the hypotheses' edits in separate files. Each worker spec must be self-contained and name:

- the one change to make and the files it may edit;
- the exact launch command, `node <absolute H>/cli.mjs run exec --loop-preflight --project <absolute main project path> --experiment <slug> --name "<change>" -- <command>`, so the Run lands in the shared catalog while code provenance comes from the worker's worktree;
- the follow-up note, `loop note --project <absolute main project path> --experiment <slug> --kind run --run <ref> --hypothesis <id> --text "<change>"`;
- acceptance: `worker_done` reports the Run reference and its final state.

The coordinator records results and decisions. Count running workers against `maxParallel` and the GPU budget.

## 5. As an Experiment agent

If Aster started you as an Experiment's research agent ("Experiment agent" in aster-research-track), the loop changes configuration only. Launch config-only hypotheses within the budget. For a hypothesis that needs a code change, record `proposal add --needs-code` and a `checkpoint` note, then continue with the other hypotheses or stop; the user hands that proposal to a Workbench chat, which launches it into this Experiment. Record each comparison you draw across Runs with `analysis add` and cite its ID in the `result` or `decision` note.

## 6. Finish

When a stop rule fires, record `loop note --kind decision --text "stop: <rule>; best <ref> <metric>=<value>"`. If you touched the manuscript, run `claim audit` and `claim scan`. Report the best Run and its metric, Runs and hours used against the budget, failed Runs, open hypotheses, and the next step you recommend.

## Rules

- Report every Run, including failures; never cherry-pick.
- Keep the evaluation fixed within one objective.
- Never hand-edit `loop.jsonl`, `run.json`, `metrics.jsonl`, or `summary.json`.
- Never exceed the budget silently, cancel the user's jobs, or retry a failure without a diagnosed cause.
- Never run `proposal decide`; only the user approves proposals, in Aster.
