---
name: aster-research-track
description: Keep an Aster research project's Experiments, Runs, analyses, and paper numbers traceable while doing research work in an agent conversation. Use when the user plans the experiments for a paper or idea (an experiment plan with a reviewer pre-mortem), starts, launches, evaluates, compares, analyzes, or reports on a concrete experiment, when Aster starts you as an Experiment's research agent or hands you an approved proposal to implement, when you write a result number into the manuscript, when you answer paper reviews in a rebuttal (Aster's Rebuttal page and its Rebuttal agent), when you draw or plot paper figures (Aster's Figures page and its Figure agent), or when you write or revise paper text (Aster's Writing page and its Writing agent), in a project with .aster/project.json (or an older research/project.json). Do not use for ordinary coding chat or one-time migration of an existing project.
---

# Track research work in Aster

The conversation is where the user directs the work. `.aster/` holds the records Aster reads to show Experiments and Runs (each Run is a folder under `.aster/experiments/<slug>/runs/`); `.aster/claims.json` ties paper numbers to Runs. Projects set up before `.aster/` keep the same files under `research/`. Maintain both as a consequence of real research work, through the harness CLI only.

If the user asks you to check an Experiment question with another agent, stay in this chat:
use `aster agent list --json` to find the relevant open chat, follow the
`aster-orchestration` consultation guide to ask it, and bring its sourced reply back here.
Do not make the user choose a session or create another agent merely for the question.

Run `aster research harness-path` on the machine that holds the project; it prints the
version-matched absolute path to `cli.mjs`. `H` below means the parent of that path. When
`aster` is not on PATH, try `"$ORCA_CLI_COMMAND" research harness-path`; in a checkout of Aster's
source, H is its `src/research-harness` folder. An installed skill's folder is never H (it holds
no `cli.mjs`); do not guess one from it. Run it from anywhere
inside the project: `--project` defaults to the nearest ancestor containing
`.aster/project.json` (or an older `research/project.json`). Add `--json` for one
machine-readable object (`{"ok":true,...}`, or `{"ok":false,"error":{"code","message"}}`
with exit 1). `node H/cli.mjs --help` lists every command.

On an SSH host Aster manages, `aster` in an Aster terminal (also `$ORCA_CLI_COMMAND`) is the CLI
of Aster's runtime on that host, and it prints a harness path on that host. If the host has no
`node`, or one older than 20, use the `node` path from `aster research harness-path --json`
instead. If `harness-path` says this Aster CLI has no bundled research harness, the host's Aster
runtime predates it: tell the user to update Aster on the desktop and reconnect the host, and do
not write records by hand meanwhile.

## This conversation and the Experiment

No command attaches a chat to an Experiment, and none is needed; do not treat its absence as a
blocker. Harness commands record the agent that ran them from the environment Aster gives its
terminals (`ORCA_AGENT_SESSION_ID`, `ORCA_TERMINAL_HANDLE`, `ORCA_PANE_KEY`), so a Run from
`run exec` or a `proposal add` names this conversation, Aster delivers proposal decisions here,
and `aster research watch --notify self` wakes it. Aster lists the chat under an Experiment when
it starts you from that Experiment; otherwise the user picks **Link to Experiment** in the
conversation's menu in Aster. Pass `--experiment <slug>` and tell the user which Experiment you
record into.

## Before planning

Run `node H/cli.mjs context` and read it. It lists Experiments, recent Runs with state and last/best metrics, loop budgets, and the claims audit summary.

## Experiments

One Experiment groups attempts that answer the same question. Reuse an existing slug when it fits; create one with `experiment --name "<name>"` only for a distinct question.

## Launch every run through `run exec`

Before launching, run `node H/cli.mjs preflight --experiment <slug> --json`. Resolve blockers
by recording the real question, primary metric, or conflicting evaluation split in the brief;
do not invent missing values to make the check pass. Warnings (for example no baseline for the
first Run, or an unknown dataset revision) remain visible in the Run report. This read-only
check does not authorize a proposal, reserve compute, or prove that the design is sound.

```bash
node H/cli.mjs run exec --preflight --experiment <slug> --name "<what varies>" \
  --metric-def loss:minimize --metric-def acc:maximize -- python train.py --lr 3e-4
```

It creates the Run, records the project repository's HEAD, dirty flag and `code.patch` (a `--cwd` inside a nested repository such as `third_party/x` is listed under `code.nested`, never taken for the project's code), host, argv, the SLURM job it runs in, and your agent identity, tees output to `train.log`, records metric lines in `metrics.jsonl`, and writes the observed exit to `run.json`. Its exit code is the command's. Never launch an experiment without it when you start the process yourself.

- Make the script print metrics, one line per observation (stdout or stderr):

  ```python
  import json
  def log_metrics(step, split, **metrics):
      print("ASTER_METRIC " + json.dumps({"step": step, "split": split, "metrics": metrics}), flush=True)
  ```

- When the project has W&B turned on (`"wandb": {"enabled": true, ...}` in `.aster/project.json`, set from the app's project menu → W&B…), `run exec` copies these metric lines to a W&B run named after the Run and grouped by its Experiment, using the host's existing `wandb login`. Keep printing `ASTER_METRIC` lines and do not add a second `wandb.init()` with the Run's name or ID. A script that already calls `wandb.init()` may keep it: the command gets `WANDB_PROJECT`, `WANDB_ENTITY`, `WANDB_RUN_GROUP` and `WANDB_TAGS`, so its run lands in the same project and group. A W&B warning (no `wandb` package, no login, no network) never fails the Run; `wandb sync --run <ref>` sends a recorded Run again.

- The command sees `ASTER_RUN_REF`, `ASTER_RUN_DIR`, and `ASTER_RUN_ARTIFACTS`; write outputs to the artifacts directory.
- Make the script announce each image, video, or audio sample it saves; the harness records it in the Run's `media.jsonl` for Aster's gallery (files must be inside the project; png jpg gif webp, mp4 mov webm, wav mp3 flac ogg and similar; anything else is refused with a notice):

  ```python
  import json, os
  def log_media(path, step=None, label=None, sample_id=None):
      print("ASTER_MEDIA " + json.dumps({"path": os.path.abspath(path), "step": step, "label": label, "sampleId": sample_id}), flush=True)
  ```

- Long runs: start it in the background and note the `[aster] started <experiment>/<run>` line on stderr. If `aster research --help` lists `watch`, sleep with `aster research watch --run <ref> --on exit --notify self` instead of polling. Otherwise check `run show <ref>` or `run list --state running` at sensible intervals.
- One Run is one execution attempt. Reruns and seeds get new Runs. Agent completion is not Run success; only the recorded exit is.
- A metric's `split` names data (`train`, `val`, `test`), never a seed: put the seed in the config and the Run name (`--name "C seed 42"`). A rerun keeps the name; Aster numbers repeats as attempts and marks a failed attempt superseded once a later one succeeds.

## When you cannot wrap the process

For SLURM, remote hosts, or a process already running: if the job runs on a filesystem that contains the project, put the `run exec` line inside the job script (with `aster gpu submit --run "node H/cli.mjs run exec ... -- python train.py"`). Otherwise:

```bash
node H/cli.mjs new-run --experiment <slug> --name "<name>" --command "<exact command>"
node H/cli.mjs run log-metric --run <slug>/<run> --step 100 --split val loss=0.41 acc=0.88
node H/cli.mjs run finish --run <slug>/<run> --status succeeded|failed|cancelled --exit-code <n> --note "<source>"
node H/cli.mjs run attach-artifact --run <slug>/<run> --file <path> [--mode reference] \
  [--kind image|video|audio --step <n> --label <name> --sample <id>]
```

Call `run finish` only from observed evidence (scheduler state, exit code, the user's report) and name it in `--note`. Use `--mode reference` for large checkpoints; it hashes but does not copy.

## When a Run ends

After `run exec` returns, or when an `aster research watch --on exit` notice wakes you for a background Run (or after `run finish` for one launched elsewhere), before you report or launch anything else:

1. `organize --run <ref> --json` refreshes `summary.json` (`run exec` and `run finish` already wrote it; organize again after attaching media or outputs). It gives the brief's primary metric (last, best), the baseline's, and the difference.
2. `check --run <ref>`, `run show <ref>`, and `media --run <ref>`: read the exit, metrics, log tail, and the samples it produced.
3. Record each problem you can back with evidence with `quality add` (below). If the brief has a rubric, judge the outputs with `rate add --by agent`.
4. Leave one note: `run annotate --run <ref> --text "<what changed>; <primary metric> <value> vs baseline <value> (<n> seeds); <anything odd>"`. Write only what the files show.

Then follow the brief's `agentPolicy` for the next Run.

## Every number in the paper gets a claim

Whenever you write a result number into the manuscript, record it right after:

```bash
node H/cli.mjs claim add --text "<the sentence>" --run <slug>/<run> --metric acc --split val \
  [--select last|best|step --step <n>] [--format percent:1] [--line <n> | --anchor 'tab:main']
```

Leave out `--value`: the harness reads it from `metrics.jsonl` and refuses a `--value` that disagrees. If it refuses, fix the paper, not the claim. A number with no Run behind it that the manuscript's own tables or a project data file state (a paper written before Aster, a results CSV) stays in the paper with its source named; suggest the claim instead of withholding the number (see "Citations and numbers" under Writing). Add `--supporting` for evidence that backs a number without being printed, such as the baseline of a reported gain; add more evidence with `claim add-evidence --id <claim>`.

Before you report results or finish a writing task, run `claim audit` (exit 1 on `mismatch` or `missing-evidence`) and `claim scan` (result-like numbers with no claim). Fix each finding or list it in your report. Use `claim refresh --id <claim>` only when the user accepts that the Run's new results replace the recorded ones.

## Quality checks and proposals

Before reporting an Experiment result, run `verify --experiment <slug> --json`; before presenting manuscript results, add `--paper`. The read-only gate combines catalog validation, open rule and recorded findings, Run states, claim audit, and a heuristic scan for unbacked numbers. Read the returned finding IDs and evidence, then inspect the cited files. `checks_clear` means these automated checks found no open issue; it does **not** validate the hypothesis, the statistical analysis, or the model outputs. `needs_review` and `insufficient_evidence` must be reported with the missing evidence. A `blocked` result exits 1; investigate it before making a result claim. Do not turn a dismissed finding into proof that the issue never existed.

`brief show --experiment <slug>` gives the Experiment's question, primary metric, baseline, rubric, and agent policy. Before you report results, run `check --experiment <slug>` (exit 1 on a `fail`) and `quality list --experiment <slug>`; address each open finding or name it in your report.

Record a problem only judgment finds (leakage, a train/val gap, a wrong split, an unfair baseline) as a finding with evidence the harness can check:

```bash
node H/cli.mjs quality add --experiment <slug> --check eval.split-leak --severity warn \
  --text "<the problem and why it matters>" --run <slug>/<run> --created-by agent \
  --evidence '{"kind":"log","run":"<slug>/<run>","fromLine":812,"toLine":830}'
```

Evidence kinds are `metric` (run, metric, split, step), `log` (run, fromLine, toLine), `file` (path, line), `manifest` (run, field), `sample` (run, sampleId), and `claim` (claim). The harness fills in values and excerpts and refuses a value that disagrees. Never mark a finding `accepted` or `dismissed`; the user does. Mark your own finding settled by a later Run with `quality resolve --id <id> --status resolved --by agent --note "<that Run>"`.

To judge outputs against the brief's rubric, record each sample with `rate add --experiment <slug> --sample <id> --run <ref> [--against <ref>] --verdict good|bad|unsure|a|b|tie --rubric <path> --judge-model <your model ID> --by agent`. It never replaces a person's rating.

A Run the user asks for in the conversation is launched directly with `run exec` as above. A Run you decide on yourself (a rerun or fix suggested by a review, a triage, or your own analysis) is proposed instead:

```bash
node H/cli.mjs proposal add --experiment <slug> --title "<what changes>" --rationale "<why, with finding IDs>" \
  --command 'node H/cli.mjs run exec --preflight --experiment <slug> --name "<what changes>" -- <command>' \
  [--config-changes '{"lr":"1e-4"}'] [--finding <id>] [--run <slug>/<run>]
```

Under the default `proposals: approval`, end your turn and wait: the user approves or rejects it in Aster, and the approval arrives in your conversation as a message. Then launch exactly that command and record `proposal launched --id <proposal> --run <new ref>`. Under `budgeted`, the aster-research-loop budget applies; under `off`, only describe reruns. Never run `proposal decide`. Add `--needs-code` when the Run needs a code change; see the next two sections.

## Experiment agent

When Aster starts you as the research agent of one Experiment (an Experiment chat), you design and analyze that Experiment. You do not change code there; a Workbench chat does.

- **Design.** To plan a set of experiments (a paper's claims, a rebuttal round, a new idea), follow "Experiment design" below: a plan above Experiments, a reviewer pre-mortem, `plan check`, and the user's approval. For one Experiment's own question, write or update the brief with `brief set` (question, hypothesis, primary metric, baseline, seeds). Propose each Run you plan with `proposal add` and its exact `run exec --experiment <slug>` command. When the Run needs any code change, add `--needs-code` and put what to change and how to tell it is done in `--rationale`; never edit code yourself from this chat.
- **Run.** Launch a config-only Run with `run exec` once the user approves its proposal (or within the budget under `proposals: budgeted`), then record `proposal launched`.
- **Analyze.** Write analysis scripts and their outputs under the catalog root's `experiments/<slug>/analysis/` (png figures; csv, tsv, or json tables; md notes). Use `.aster/` for current projects and `research/` for legacy projects. Record each result you report:

  ```bash
  node H/cli.mjs analysis add --experiment <slug> --title "<what it shows>" \
    --file <record-root>/experiments/<slug>/analysis/<file> --summary "<one-paragraph takeaway: numbers, n, caveats>" \
    --run <slug>/<run> [--run <slug>/<run>]... [--supersedes <analysis-id>]
  ```

  Write only what the file shows. Pass `--supersedes` when a newer analysis replaces an older one. `context` lists the latest analyses; read them before redoing one.

- **Explain failures** from evidence: `run show <ref> --log-lines 50`, metrics, and config. Record the cause with `quality add` and propose the fix.
- **Status.** Aster shows an Experiment as Running while one of its Runs runs and as Analyzing once Runs have ended, until its brief says otherwise. When the stage changes for another reason, set it with `brief set --experiment <slug> --status planned|running|analyzing|concluded|abandoned`. Put the takeaway in an analysis and your report and ask the user to record the conclusion; once they do, the Experiment shows Concluded.
- The conclusion (`brief.conclusion`), finding decisions, and proposal decisions are the user's.

## Experiment design

Use this when the user asks you to design or plan the experiments for a paper, a set of claims, a
rebuttal round or a new idea, or when a stage's gate fails and the plan must change. One Run or one
tuning loop does not need it. The plan sits above Experiments: each question becomes one
Experiment, each matrix cell becomes one proposal, and nothing runs until the user approves.

Measured on 167 papers' reviews and on plans written without this guide: models already add seeds,
variance, simple baselines and validation-only tuning. What they miss is the work that turns a wish
list into a study (cost, order, gates, stopping rules, a minimum effect, an out-of-scope list,
reproduced baselines, equal tuning trials) and the prior methods and datasets reviewers name.
Budget cuts then removed exactly what reviewers ask for. The steps below target those gaps.

### 0. Read, ask, and find the closest prior methods

Read `context`, the manuscript's abstract, contributions and method (claims and components),
existing Experiments and Runs, and `plan list`. `plan costs` lists this project's timed Runs as
GPU-hours: your first cost basis. Ask the user at most five questions, only for what you cannot
infer: compute (GPU-hours or GPUs × days) and deadline, team size, venue, must-have baselines or
datasets, the codebase, what would make them drop the idea.

**Never invent a budget.** Record the person's own numbers with `"source": "user"` (or
`"compute-policy"` from `aster gpu`). GPUs and days they named are their budget: write
`"gpus": 4, "days": 10` and the harness counts 4 × 10 × 24 GPU-hours, keeping `reserve` (20%
unless they say otherwise) spare for reruns and debugging. People and weeks go in `scope.team`.
When they have not given compute, leave `gpuHours` out, set `"source": "unknown"`, and let the
tiers carry the cost: the person picks.

**Closest prior methods, before anything else.** Reviewers' most common request is a comparison
with the closest prior method, and plans written from memory miss it. Search for the 3–5
published methods closest to this one (the same problem, the same mechanism, the method it
extends): `node H/cli.mjs papers search "<what the method does>"` (arXiv; every word must match,
so try a few short queries: the problem, the mechanism, a known method's name), your web search
when you have one, the project Library (`paper/references.bib`, `.aster/library/`) and the
manuscript's related work. Record each in `baselineSearch.closest` as a paper, `{"method",
"title", "arxiv" or "doi", "year", "why", "claim"}`, then compare against it (`"baseline": "B2"`,
role `closest-prior`) or write why not (`"reason"`). `plan submit` asks Aster to keep each of these
papers in the project Library (`library add --why "closest prior method for <claim>"`, skipping
any already asked for); the person's setting decides whether they go in.

### 1. Draft

`plan new --title "<paper or question>" --file -` with the JSON below; change it with
`plan set --file -` (whole plan) or `plan set --merge --file -` (only the top-level fields given).
Every change bumps the revision and returns the plan to draft. `plan show` prints plan.md.

<!-- prettier-ignore -->
```json
{
  "method": "one paragraph: the method and its components",
  "scope": {"target": "ICLR full paper", "compute": {"gpus": 8, "days": 3, "hardware": "8x A100", "source": "user|compute-policy|unknown", "reserve": 0.2},
            "team": {"people": 2, "weeks": 6},
            "outOfScope": [{"item": "irregular series", "reason": "the method assumes a fixed grid"}]},
  "claims": [{"id": "C1", "text": "…", "kind": "performance|generality|mechanism|efficiency|robustness|analysis",
              "weight": "main|secondary", "evidence": ["Q1"], "status": "planned|argued-only"}],
  "questions": [{"id": "Q1", "claim": "C1", "text": "…", "hypothesis": "…", "predictionIfFalse": "…",
                 "minEffect": "2% relative MSE or 0.5 seed std", "experiment": "<existing slug, optional>"}],
  "methodComponents": [{"id": "M1", "name": "…", "ablation": "A1"}, {"id": "M2", "name": "…", "ablation": "none", "reason": "…"}],
  "baselines": [{"id": "B1", "name": "…", "role": "strongest-recent|closest-prior|simplest|no-training-floor|ablated-self|input-ablated|oracle|standard-recipe",
                 "why": "…", "source": "rerun-official-code|reimplemented|copied", "copiedFrom": null,
                 "reproduce": {"cell": "S0.reproduce-B1", "tolerance": "within 3% of the published number"},
                 "fairness": {"sameData": true, "sameBackbone": true, "trainingBudget": "same epochs",
                              "tuning": {"trials": 20, "space": "lr x wd", "selectionSplit": "val"}}}],
  "notCompared": [{"name": "…", "reason": "…"}],
  "baselineSearch": {"sources": ["papers search", "project Library", "related work", "leaderboards"],
                     "closest": [{"method": "InfoTS", "title": "…", "arxiv": "2303.11911", "year": 2023, "why": "…", "claim": "C1", "baseline": "B2"},
                                 {"method": "…", "title": "…", "doi": "10.…", "year": 2024, "why": "…", "reason": "why it is not compared"}]},
  "datasets": [{"id": "D1", "name": "…", "role": "main|heldout|ood|stress|sanity", "why": "…",
                "splits": {"select": "val", "report": "test"}, "replaces": null}],
  "metrics": [{"name": "mse", "direction": "minimize", "split": "test", "primary": true, "why": "…"}],
  "statistics": {"seedsMain": 5, "repeatUnit": "seed|seed+split|whole-sweep", "variance": "std|se|ci95|bootstrap-ci",
                 "test": "paired-bootstrap", "testReason": null},
  "hyperparameters": {"selectionSplit": "val", "methodTrials": 20, "tuningCostIncluded": true,
                      "saturationCheck": "…", "sensitivity": [{"knob": "beta", "levels": [0.01, 0.1, 1]}]},
  "protocol": {"checkpoint": "last epoch", "decoding": "…", "sharedByAllArms": true},
  "matrix": [{"cell": "S0.reproduce-B1", "stage": "S0", "question": "Q1", "purpose": "sanity|pilot|main|ablation|sensitivity|tuning|cost|analysis|heldout|generality|judge-validation",
              "tier": "must|should|could", "factors": {"method": "B1", "dataset": "D1"}, "compareTo": [], "seeds": 1,
              "cost": {"gpuHoursEach": 0.5, "source": "prior-run|paper|measured|timing-cell|estimate"},
              "expect": "…", "command": "node H/cli.mjs run exec --experiment <slug> --name … -- …", "cutReason": "…"}],
  "ablations": [{"id": "A1", "component": "M1", "structure": "remove|swap|sweep|stepwise|factorial|add-on-top",
                 "default": "full method at 100 epochs", "budget": "reduced (100 epochs)", "cells": ["S3.abl-M1"]}],
  "costBasis": [{"what": "one 100-epoch run on ETTh1, 1 A100", "gpuHours": 0.5, "basis": "prior Run ts-aug/run-12, 28 min"}],
  "costMeasurements": [{"id": "K1", "what": ["wall-clock per epoch", "peak memory"], "methods": ["ours", "B1"], "protocol": "…", "cell": "S4.cost"}],
  "analysis": [{"id": "N1", "kind": "failure-cases|slices|mechanism-probe|qualitative|sensitivity|contingent", "question": "…"},
               {"id": "N2", "kind": "contingent", "trigger": "after S2: any setting where ours loses or ties", "question": "why?", "budgetGpuHours": 10}],
  "leakageChecks": [{"what": "…", "how": "…"}],
  "humanEval": {"needed": false, "reason": "…"},
  "stages": [{"id": "S0", "name": "sanity", "budgetGpuHours": 2, "gate": "B1 within 3% of its published number"}],
  "decisionPoints": [{"after": "S1", "if": "…", "then": "…", "else": "…"}],
  "stoppingRules": ["A stage's budget spent: stop and ask", "Three failed Runs of one cell: checkpoint", "A gate failing twice: back to draft"],
  "risks": [{"text": "…", "mitigation": "…"}]
}
```

Work in this order; `plan check` names the rule behind each:

1. **Claims → questions.** Every main claim gets a question with a falsifiable hypothesis, the
   result that would count against it, and a minimum effect in metric units or seed spread. A
   claim you will not test is `argued-only`; say so now.
2. **Components.** List every component; each gets an ablation (fixed default, one factor at a
   time, a declared budget) or a reason.
3. **Baselines.** Start from the closest prior methods of step 0; add the strongest recent method
   on these datasets (leaderboards, papers citing the closest prior method) and record where you
   looked in `baselineSearch.sources`; every candidate ends in `baselines` or `notCompared` with a
   reason. Give each baseline a role; include a strongest-recent and a simplest or no-training
   floor. Re-run strong
   baselines with your recipe, reproduce their published number in S0 with a tolerance, and give
   every arm the same tuning trials (a different count needs `asymmetryReason`). Copied numbers
   name `copiedFrom` and never alone support an improvement.
4. **Datasets and metrics.** Keep the field's standard benchmarks in the main table; a cheaper
   substitute goes in a pilot, or carries `"replaces"` and needs the person's consent. Add at
   least one held-out, OOD or stress setting, or a reason. One primary metric per question, a
   reason for each metric, a secondary where the primary is contested.
5. **Statistics and protocol.** At least 3 seeds on main cells (5 when the minimum effect is near
   seed spread), the repeat unit, the variance statistic, one rule for calling a win, selection on
   validation only, one checkpoint/decoding rule for every arm. One statistical procedure per
   question unless there are more than ten comparisons. A judged metric needs a judge-validation
   cell before the main results.
6. **Cost and analysis.** Measure the method's own cost against its main baseline. Plan a
   failure-case analysis, a slice or mechanism analysis (every mechanism claim gets a probe of
   something other than the task metric), and a contingent analysis with reserved hours for
   "why is it weaker on X".
7. **Matrix, stages, gates.** Cells of one configuration × N seeds, each with a question, a
   purpose, `compareTo` cells that differ only in the named factor, seeds and a cost with its
   source. Build costs from a few unit costs in `costBasis`, each with its basis: a prior Run
   (`plan costs`), a number the paper reports, or `plan estimate --params N --tokens N --gpu a100`
   (6·N·D to train, 2·N·D to run, at a realistic utilisation; or `--step-seconds S --steps N`);
   add an S0 timing cell when the basis is weak. Count tuning trials in the cost. Order: S0 sanity (reproduce a baseline, check the evaluation, overfit a batch,
   timing) → S1 cheap falsifier → S2 main → S3 ablations and sensitivity → S4 generality, cost,
   analysis. Every stage has a numeric gate; every decision point says what happens if it passes
   and if it fails. Add stopping rules. Keep about 15 cells per stage at most.
8. **Priority, tiers and fit.** `plan overview` ranks every cell by what it decides: the claims it
   supports (main claims count most), the reviewer requests it answers (likely demands most), the
   comparisons it anchors and the closest prior methods it runs. Mark each cell must
   (claim-critical), should or could, and keep the plan short enough to read: about 30 cells,
   at most 3 could cells (those answering a likely request), and no cell that decides nothing
   (`plan.no-decision`). Fit the compute yourself: the kept cells stay within the budget less the
   spare share; where they do not, shrink or drop the lowest-priority cells, and leave the person
   only real trade-offs. `plan overview` lists the cuts that would fit, lowest priority first,
   with what each loses (claims, reviewer requests, baselines, comparisons). Write `command` when
   you know it (else the approved proposal goes to a Workbench chat) and a `cutReason` for cells
   you would cut first.

### 2. Reviewer pre-mortem

Before the plan is shown, three simulated reviewers read the method, the claims and the plan and
demand experiments: R1 the closest-prior expert (baselines, fairness, hyperparameters, metrics),
R2 breadth and practicality (datasets and domains, the method's cost, model variety, leakage),
R3 evidence and mechanism (claim gaps, ablations, analysis, seeds, tests, human evaluation).

1. `plan premortem brief --reviewer R1` (then R2, R3) prints each brief: the plan digest, the
   Library, your `baselineSearch.closest`, and how often reviewers ask for each category (missing
   baseline 74% of papers, analysis 71%, dataset or domain 70%, cost 59%, claim gap 58%, ablation
   48%, hyperparameters 47%, unfair comparison 42%, metric 31%, model variety 26%, seeds 14%,
   leakage 7%, human evaluation 7%, statistical test 6%).
2. Run each brief in a fresh context: a subagent, or another Aster agent through the
   aster-orchestration consultation guide. When you cannot, play each reviewer in turn yourself
   from its brief alone, and do not defend the plan while you do.
3. Record each reviewer's JSON: `plan premortem record --file -`.
4. Resolve every request with `plan premortem resolve --file -`
   (`{"resolutions":[{"id":"PM3","as":"plan|out-of-scope|ask","items":["cell or item IDs"],"reason":"…","costGpuHours":18}]}`):
   - `plan`: add or point to the cells that answer it (`items`).
   - `out-of-scope`: a written reason; it joins `scope.outOfScope`.
   - `ask`: it costs more than fits, or only the person can judge it. Add its cells anyway, give the
     cost and the reason; the person includes it or leaves it out.

A likely request (high or medium) for a missing baseline, a missing dataset or domain, an ablation
of a core component, or the method's own cost makes its cells **must**, whatever tier you wrote:
these are what reviewers ask for most and what cuts removed in trials. Never set such a request
out of scope yourself for cost; resolve it as `ask`. When the must tier then exceeds the budget,
say so plainly and ask for more compute or for the person's cuts.

### 3. Check and revise

`plan check` reports `plan.*` findings like `check`: `fail` blocks submitting, `warn` needs a fix
or a reason, `info` is shown. Fix by changing the plan or by writing the reason the check asks
for; never by deleting a claim without telling the user. Then pre-mortem again only for what
changed. **At most two rounds**; list what stays open.

### 4. Submit and present

`plan submit` (refused while a fail remains). End your turn with one screen, not the whole plan
(Aster shows it in the Plan view, and `plan show` prints it): the claims → questions → stages
table with each claim's weakest link; the closest prior methods and how each is handled; the cost
against their compute (the fit line of `plan overview`) and the first cuts if they need more room,
with what each loses; the gates and what happens if each fails; the pre-mortem requests you
resolved as ask, with their cost; the top three risks; the decisions you need. Keep it under
about 600 words.

The person decides in Aster's Plan view (Experiments page): they state compute, uncheck cells or
take the suggested cuts (each cut shows which claims lose evidence and which likely reviewer
requests go unanswered, and needs an out-of-scope reason), decide the ask items and approve. Approval pins the revision and
proposes the first stage's cells; each proposal still waits for its own approval. Later stages are
proposed by the person after their gates. **Never approve a plan, a stage, a proposal or a
finding, never state the budget for the person, and never set a claim to supported, weakened or
refuted**; `plan approve`, `plan budget` and `plan propose-stage` are refused in agent sessions.

After approval, run cells in plan order (follow "When a Run ends"), write the analysis that
decides each gate, and report it. A failed gate or a surprise: stop, revise the plan, submit
again.

## Workbench handoff

When the user approves a `--needs-code` proposal and hands it to a Workbench coding chat from Aster, that chat receives the proposal. If you are that coding agent:

1. Read the proposal (`proposal list --experiment <slug>`) and `brief show --experiment <slug>`; implement the change it describes.
2. Launch with `run exec --experiment <slug>` and the proposal's command, changed only as the implementation requires, so the Run lands in the same Experiment with this code's provenance.
3. Record `proposal launched --id <proposal> --experiment <slug> --run <new ref>`.
4. Follow "When a Run ends", then report back: what you changed, the Run reference, and its result. Leave the analysis and conclusion to the Experiment chat.

Never run `proposal handoff`; only the user hands work over, in Aster.

## Papers for the Library

When a paper matters to the project (a baseline, the closest prior method, a paper the user asks
about), ask Aster to keep it in the project Library:

```bash
node H/cli.mjs library add --arxiv 2410.12345 --why "closest prior method"
node H/cli.mjs library add --doi 10.1145/3292500.3330701
node H/cli.mjs library add --title "<title>" --authors "<first author> et al." --year 2024
```

Aster asks the person in this chat, or adds the paper with its metadata and PDF at once when they
chose to add papers automatically. Papers you link or cite in a reply are offered the same way.
Do not download PDFs or edit the Library's files for this yourself.

## Rebuttal

When the user answers paper reviews (Aster's Rebuttal page and its Rebuttal agent), write every
rebuttal file with `rebuttal` commands; never hand-edit them. Aster shows each change on the page
as soon as it is saved. A rebuttal lives in `.aster/rebuttal/<slug>/` (`research/rebuttal/` in
older projects); `--rebuttal <slug>` may be left out when the project has only one.

| File                 | Holds                                                                                                                                                                                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rebuttal.json`      | name, venue, OpenReview forum, limits (`replyChars`, default 5000; `generalChars`; `pdfPages`), reviewers `R1`… with label, rating, confidence and opening, the general response intro and closing, `agentEdits` (`apply` default, or `ask`)                                             |
| `reviews/R1.md`      | one reviewer's text, as pasted or imported                                                                                                                                                                                                                                               |
| `points.json`        | atomic points: `id` (`R1-W2` weakness, `R1-Q1` question, `R1-M1` minor; numbered in review order), `kind`, `type` (experiment-request, clarity, related-work, novelty, soundness, reproducibility, presentation, typo, other), `summary`, and `quote` copied verbatim from the review    |
| `clusters.json`      | one answer each: `id` (`C1`), `title`, `points`, `action` (`experiment` new run, `text` paper change, `clarify` reply only), `plan`, `status` (`todo`, `drafting`, `done`), `experiment` (catalog slug), `manuscript` (`file`, `line`, `anchor`), `response` (Markdown draft), `general` |
| `promises.json`      | what the rebuttal promises for the final version: `P1`, `text`, `clusters`, `done`                                                                                                                                                                                                       |
| `responses/`         | assembled outputs: `reviewer-R1.md` (`reviewer-R1-round-2.md` for a later round), `general.md`, `rebuttal.tex`                                                                                                                                                                           |
| `followups.json`     | a reviewer's later replies as rounds: `reviewer`, `round` (2, 3…), `text`, `receivedAt`; points of a round carry `round` and quote its text                                                                                                                                              |
| `proposals.json`     | the agent's latest text per reply: `slot` (`C3`, `opening:R1`, `general:intro`), `text`, `base`, `turn`, `request`; `applied` ones are in the reply and `base` is what Undo puts back, others wait for the person                                                                        |
| `predictions.json`   | a simulated reviewer's next-concern predictions (`R1-N1`, `concern`, `why`, `likelihood`, `trigger`, `preempt`, `status`)                                                                                                                                                                |
| `paper-changes.json` | tracked manuscript changes: `E1`, `cluster`, `promise`, `file`, `find`, `replace`, `why`, `status` (`pending`, `applied`, `rejected`)                                                                                                                                                    |
| `history/`           | kept versions of each reply (`C3.json`, `opening-R1.json`, …)                                                                                                                                                                                                                            |
| `regroups.json`      | regroups that touched written replies (`G1`: `summary`, the affected clusters `before` and `after`, `applied`), and the `archive` of clusters removed with their replies (`A1`)                                                                                                          |
| `translations.json`  | reading translations: `key` (`quote:R1-W2`, `summary:R1-W2`, `title:C3`, `reply:C3`, `reply:opening:R1`, `reply:general:intro`, `review:R1`, `review:R1-round-2`), `language`, `text`, and the `hash` of the text it translates                                                          |

```bash
node H/cli.mjs rebuttal show --rebuttal <slug>
node H/cli.mjs rebuttal points set --rebuttal <slug> --file - [--reviewer R2] < points.json
node H/cli.mjs rebuttal clusters set --rebuttal <slug> --file - < clusters.json
node H/cli.mjs rebuttal response set --rebuttal <slug> --cluster C3 --file - < answer.md
node H/cli.mjs rebuttal response revise --rebuttal <slug> --cluster C3 --file - < '{"find":"exact passage","replace":"new passage"}'
node H/cli.mjs rebuttal followup add --rebuttal <slug> --reviewer R1 --file - < followup.txt
node H/cli.mjs rebuttal paper propose --rebuttal <slug> --cluster C5 --file - < '{"file":"paper/main.tex","find":"…","replace":"…","why":"…","promise":"…"}'
node H/cli.mjs rebuttal promises add --rebuttal <slug> --text "Add X to Table 2" --cluster C3
node H/cli.mjs rebuttal assemble --rebuttal <slug> [--format reviewer|general|pdf|all]
node H/cli.mjs rebuttal translate set --rebuttal <slug> --language ko --file - < '{"items":[{"key":"reply:C3","text":"…"}]}'
node H/cli.mjs rebuttal translate list --rebuttal <slug> --language ko --todo
```

- **Split.** One concern, request, or question per point; skip summaries and praise. The quote is
  the review's exact text; the harness finds its offsets and rejects a quote it cannot find.
- **Group.** Points one answer serves share a cluster, across reviewers; a point is in at most one
  cluster. `clusters set` replaces the list and keeps each cluster's draft by ID, so keep the IDs
  of clusters that stay the same.
- **Regroup.** Merging, splitting, moving points between or removing clusters is allowed, also
  when they have written replies; no written text is lost. A reply whose cluster goes away moves to
  the cluster that takes its first point, joined after that cluster's reply as a new paragraph;
  when you merge answered clusters, send the merged reply as the surviving entry's `response` in
  the same `clusters set`. A split keeps the reply with the cluster that keeps the ID (or the first
  part); other parts start empty unless their entry has a `response`. A cluster with a reply and
  nowhere to go (its points left every cluster, or `points set` dropped them) is archived with its
  reply in `regroups.json`, restorable in Aster. Every replaced reply is kept as a version,
  promises, paper changes and predictions follow their cluster, and translations go outdated.
  One regroup is one change the person can undo; pass `--turn` and `--request`. Set to Ask first,
  a regroup that touches a written reply waits as one proposal, and so does one that lands while
  the person is typing in an affected reply. The output says which happened.
- **Draft.** Answer first, then evidence with real numbers from Runs (`context`, `run show`), then
  the paper change. Never invent results: write `[TBD: …]` and propose the Experiment that would
  produce it. Record each promise with `promises add` as you make it.
- **Edits apply directly, and can be undone.** `response set` and `response revise` put your text in
  the reply, also over text the person wrote. The harness first keeps the earlier text as a
  version, and Aster shows "Edited by the agent" with a one-click Undo, so build on what is
  written instead of starting over, and change only the replies you were asked about. When
  `rebuttal.json` has `"agentEdits": "ask"` (Ask first), text over a written reply waits as a
  proposal the person accepts or discards; the command output says which happened. If the person
  is typing in that reply, Aster keeps their words and holds yours as a suggestion. In `clusters
  set`, a `response` on a cluster that already has a reply is used only when other replies merge
  into it; otherwise use `response set`. Pass the `--turn` and `--request` Aster gives you. Only the person marks a reply Ready (`--status
  done` is refused).
- **Revise.** To change part of a reply, send `response revise` with the exact passage; a whole-reply
  revision goes through `response set`. Keep every number and citation unless the request says
  otherwise, and never add one.
- **Translations.** When Aster says the person reads in another language, write the replies in the
  review language and, in the same turn, save a translation of each reply, opening or general text
  you save with `translate set` (`"proposal":"X4"` for text that waits as proposal X4). When asked
  to translate, `translate list --todo` gives every missing or outdated item with its source.
  Translate faithfully and keep numbers, math, citations, IDs and `[TBD: …]` as written. The
  harness stores each translation with the hash of its source, so a later edit marks it outdated.
  Translations are for reading only; never change a reply, concern or review to translate it.
- **Follow-ups.** A reviewer's later reply is a new round: `followup add`, then `points set` with
  `"round": 2` and a quote from the follow-up. Answers go into clusters as usual; each round
  assembles into its own reply.
- **Manuscript.** Never edit the paper from a rebuttal request. When a concern needs a paper change,
  record it with `paper propose` (an exact passage, its replacement, why, and the promise); the
  person approves it in Aster (one by one or Apply all), which applies it. Paper changes never
  apply on their own: they edit the manuscript, which has no version kept here to undo to.
- **Assemble.** Each reviewer's reply answers their points in review order as A1, A2…; an answer
  an earlier reviewer already got becomes "Please see our response to R1 (A2)" (`assemble
  --shared general|repeat` moves it to the general response or repeats it). `assemble` exits 1
  when a reply is over its limit: shorten the wording, keep the facts.
- Do not launch runs or post to OpenReview from a rebuttal request unless the user asks.
- **Simulated reviewers.** A chat Aster starts as a reviewer simulation is not the author: it may
  run only `rebuttal reviewer-context --reviewer R<n>` and
  `rebuttal predictions set --reviewer R<n> --file -` (JSON `{"predictions":[{concern, why,
  likelihood, trigger:{cluster, point, quote}, preempt}]}`). It never
  writes replies, clusters, points, promises or paper changes, and it never edits the manuscript.

## Figures

When the user asks for a paper figure (Aster's Figures page and its Figure agent), draw it as an
Excalidraw scene of editable shapes, never as a flat image. Figures are worked on in the project's
record folder: `<record root>/figures/<slug>.excalidraw` (`.aster/figures/`, or `research/figures/`
in an older project); `figures new` puts them there. Aster on the person's computer writes
`<slug>.svg`, the vector `<slug>.pdf` and a PNG preview of exactly what the PDF shows in the
background whenever it runs and is connected to the project, the figure open or not; never write
those yourself, and never ask the person to open a figure so it renders. When `figures preview`
says Aster is not connected, keep working from `figures check` and `figures show` and say that
the preview appears once Aster is running and connected. Keep the drawing script at
`<figures>/src/<slug>.figure.mjs` and commit it with the figure, so the figure can be regenerated.
A plot (a data figure) is a Python script instead, `<figures>/src/<slug>.plot.py`: see Data figures
at the end of this section. An older
figure still next to the manuscript (`paper/figures/<slug>.excalidraw`) stays there and is edited
in place; `figures list` shows where each one lives.

**The paper receives a figure only when the person asks.** Working files stay in the record
folder, and neither you nor any script copies them next to the manuscript. When the person says
to put a figure in the paper or use it there (not when you merely finish one), run `figures publish
--figure <slug>`: it waits for Aster's render of the current scene, copies only the vector PDF to
`<manuscript folder>/figures/<slug>.pdf` (`--manuscript <tex>` picks another manuscript) and records
what it was made from, so `\includegraphics{figures/<slug>.pdf}` works as before. Later edits
never change the paper by themselves: `figures list` reports the paper copy as outdated, and
`figures publish` again updates it when the person asks. Refused with a PDF already there that this
figure did not write, `--replace` overwrites it only if the person says so; a figure beside the
manuscript needs no publishing. Do not add the `\includegraphics` line to the manuscript unless
they ask for that too.

```bash
node H/cli.mjs figures refs --figure <slug> --for "<what it shows>" [--pin <ids>] # 2–3 reference figures to follow, BEFORE drawing; pinned ones first
node H/cli.mjs figures careful --figure <slug> [--start --rounds N | --sketches "…" | --chose s<k> | --review | --round <k> --fixes "…" | --done "…"]  # careful drawing: sketches, then the art director's rounds
node H/cli.mjs figures art --figure <slug> [--part <name> (--gen --aspect W/H [--ref data/<figure>/x.png] | --from <png> | --prep) [--split] [--soft]]  # hybrid: textless generated art, keyed, with a grid to read anchors (figures kit art)
node H/cli.mjs figures kit [topic|name,…] # an index of the kit; a topic or names give options, defaults, bind targets
node H/cli.mjs figures kit colors          # the colour presets with their hex values and rules
node H/cli.mjs figures kit examples [name] --figure <slug> # worked scripts, laid out for your page
node H/cli.mjs figures context [--manuscript <tex>] [--figure <slug>]  # sections and run-in headings of that manuscript
node H/cli.mjs figures run --figure <slug>  # runs the script (writes the portable aster-figures-kit.mjs shim beside it)
node H/cli.mjs figures list | figures show [--figure <slug>]     # page, style, script, elements
node H/cli.mjs figures new --name "Method overview" [--size single|double|WxH] [--style graphite]
node H/cli.mjs figures check [--figure <slug>] [--area <frame id>]  # layout lint; ERRORs must go
node H/cli.mjs figures critique [--figure <slug>]  # the design pass: focus, colours, repeats, sizes; the cuts to make
node H/cli.mjs figures preview [--figure <slug>] [--wait 90]       # waits for Aster's PNG, prints it
node H/cli.mjs figures edits --figure <slug> [--release <id>]      # the person's hand edits, kept over your script
node H/cli.mjs figures edit --figure <slug> --set <id>.<prop>=<value> [--set …]  # a few direct changes, no rerun
node H/cli.mjs figures publish --figure <slug> [--replace]          # only when the person asks: copies the PDF to the paper
```

**References first.** Reference first, as designers work: before drawing, run `figures refs --figure <slug> --for "<what
the figure shows, in concept words>"` (or `--kind 3d-vision | generative | architecture |
embodied`); it prints the 2–3 closest published figures with a recipe for each (layout skeleton,
glyphs with their kit calls, colour roles, emphasis, type, hand-made details) and the image to open
when a reference folder is set up: open each and look closely. Pick one and name it in the design
brief (`fig.design({ brief: 'Following <id>: …' })` and in the chat): follow its composition and
glyph vocabulary, never its content, words or pictures; a figure never follows its own paper's
figure (`figures refs` leaves it out). Before you finish, open your print-size preview beside that
reference image and compare: the concept drawn, not boxed; one story axis; one glyph family in one
view; colour for one meaning; pictures inside the drawing; the contribution leading by size. Fix the
largest difference first.

What `figures refs` knows: a recipe for each of the reference figures the person picked (NeRF,
Mip-NeRF, Plenoxels, Instant-NGP, EG3D, TensoRF, score-SDE, VAR, Make-A-Video, Mamba,
FlashAttention, S4, DenseNet, RT-2, PerAct), our own text, never the images. The images are other
papers' figures and stay on the person's computer: `ASTER_FIGURE_REFERENCES`, the project's
`.aster/figures/references.json` (`{ "library": "<folder>" }`) or Aster's app-data
`figure-references` folder, each holding `img/<id>.png` (or a `refs.json` that lists them). Without a
folder the recipes still print. It leaves out the figure's own paper (the page's `paper`, the
manuscript's title, a request that names the paper, `--exclude <id>`); never look for that image
yourself. `figures refs <id>` prints one recipe, `--list` all of them. The folder may also hold the
person's own images (`img/<id>.png`, added from Settings → Research): they have no recipe, so read
their layout, glyphs and colour roles from the image itself; `--list` names them, and references the
person pinned come first (`--pin <ids>`).

**The Figure agent's switches.** The Figures page has three switches per project (their defaults are
in Settings → Research): careful drawing (off by default), references (on when a reference folder
exists) and concept image (experimental, off; used one of two ways: concept → redraw, or
hybrid: generated art + vector text); each request says which are on. Careful drawing and
the concept image apply to whole figures (a new drawing, a redraw, Clean up), not to a change of an
area or a selection.

Careful drawing (only when its switch is on; the request says so and gives N): first sketch 3–4 compositions that differ in layout, not in detail (each a different arrangement or story axis; rough boxes, arrows and one-word labels) as copies of the figure in `.careful/<slug>/s1.excalidraw` to `s4.excalidraw` beside it (`figures careful --figure <slug> --start --rounds N` makes the folder), record them with `figures careful --figure <slug> --sketches "s1: … | s2: …"` and pick one with `figures careful --figure <slug> --chose s<k> --why "…"`; when the person picks, stop after the sketches until they choose one in the panel. Then draw it in full and run N art director rounds: preview, then `figures careful --figure <slug> --review` prints the separate art director's address and the request to send (`aster orchestration send`, then `aster orchestration check --wait`); record its reply with `figures careful --figure <slug> --round <k> --fixes "…"`, make every fix, and go on until round N or a SHIP answer, then `figures careful --figure <slug> --done "…"`. Never review your own figure in its place; when no art director answers, say so in the chat.

Art director's review: compare the print-size render with the reference image it follows and with the rubric (the idea clear in five seconds; the concept drawn, not boxed; one story axis; one glyph family in one view; colour for one meaning; the contribution leading by size or place; each fact once; rows and columns aligned; every label legible at print size). Answer SHIP or REVISE on the first line, then at most 8 fixes, largest first, each specific and measurable: the element or region (its id or label), what is wrong as a number (a gap of 37 units against 16, text at 5.5 pt against 7 pt, three hues against two) and the target value or position. Check that last round's fixes were made; no praise, no redrawing, no file edits.

References off (the person's switch): skip `figures refs` and the comparison with a reference image; compose from the method itself and the closest worked example, and write "no reference" in the design brief.

Pinned references: when the person pins references, `figures refs --pin <ids>` prints those first (an image of their own has no recipe: read its layout, glyphs and colour roles from the image); follow one of them unless none fits the figure, and say why.

Concept image (experimental; only when its switch is on): before drawing, generate one concept image of the figure with Codex's image generation (your own image tool when you are Codex, else `codex exec --enable image_generation`), save it as `references/<slug>-concept.png` in the figures folder, then recreate it as editable shapes the way a recreation reads a reference: positions and sizes measured from the image scaled to the page width, in the paper look, with every word, symbol and formula taken from the paper, never from the image (image models misspell and invent labels). It is a sketch to measure, not a reference to keep: its colours and type give way to the paper look. With careful drawing on too, the concept image is one sketch, not the plan: draw its composition roughly as one of s1–s4 (say which in `--sketches`), the others your own compositions, and the pick goes by composition as for any sketch.

Hybrid figure (experimental; only when the concept image switch is on with "hybrid: generated art + vector text"): an image model draws only the illustrative parts, without any text, and you lay out the figure with the kit and draw everything precise over them as editable vector. Lay the figure out first (brief, references, structure, the page) and decide each illustrative slot with its place and size: a 3D scene or lit volume box, an object, a photo-textured oblique plane, a rendered sample the project has no picture for. Small icons (cameras, lamps, a sun) come out as clip art: draw them with the kit. Everything precise stays kit work: all text, math, arrows, brackets, labels, panel captions, plain boxes, exact counts (grids, windows, patches: `art.grid` or `fig.quadGrid` over the art) and the project's own pictures. For each slot, or one band of several (`--split` cuts separate objects apart), write `art/<slug>/<part>.prompt.txt` in the figures folder: the parts in plain visual words, never a paper's, method's or figure's name and never "the X figure" (image models recall published figures and copy them), no text in it, every prompt of the figure ending with the same STYLE line (one light direction, one palette); then `figures art --figure <slug> --part <part> --gen --aspect <slot w/h>` (at most 4 images a figure; `--ref` passes one of the project's own pictures as content, never a published figure). Open each grid image it writes: regenerate a part with letters, numbers, a wrong count or view, or draw it with the kit. Place each with `fig.art({ id, part, x, y, w | h, anchors })`, anchors read off the grid image as shares [u, v] (a plane's corners tl, tr, br, bl are found for you; `grid({ veil: 40 })` keeps lines readable over a photo), and set labels, math and arrows at `art.at(name)`; at print size check each label sits beside or on a clear part of its object, each arrow ends on the drawn object, and the art and the vector agree.

**Drawn, not boxed.** Draw the concept, not a box: a tensor or feature volume as a cuboid with its sizes (`fig.tensor`),
feature maps as stacked planes or a shrinking staircase (`fig.planes`), multi-scale tokens as maps
on a pedestal (`fig.tokenMaps`), a voxel grid (`fig.voxelGrid`), a video as a 3D filmstrip
(`fig.filmstrip`), memory tiers as a pyramid (`fig.pyramid`), a tiled matrix with its loops
(`fig.tiledMatrix`), dense skips as curved arcs (`fig.skipArcs`), tokens as one row of pills
(`fig.pills`), scenes with rays and cones in `fig.perspective`; `figures kit drawn` lists them, all
in one oblique view, and their colours that encode values (a tier, a source layer, a picture's
pixels) stay as drawn under the design pass.

**Worked examples first.** Start a hard figure from the closest worked example: `figures kit
examples` lists whole, short scripts (rays through image planes, a ray beside a cone and its
Gaussians, a tri-plane, a camera rig, Swin windows, a lit 3D scene, volume boxes, a U-Net with skips,
state lanes fanning out, an agent loop with feedback, score distillation back through a renderer, a
diffusion teaser, a loss landscape, a dense block with skip arcs, token maps by scale, memory tiers
and tiles, a filmstrip cascade); `figures kit examples <name> --figure <slug>` prints one laid
out for your figure's page (they read `fig.page`) and says how it fits there; copy it, then change
it.

**The paper look.** The paper look is the default for method, architecture, pipeline and system
figures in every preset (`fig.style('illustrative')` or `look: 'preset'` only for a teaser drawn as
an illustration): words and math in the manuscript's LaTeX face (Computer Modern, or Times when its
preamble loads Times or a NeurIPS, ICLR, ICML or CVPR style), sub-figures titled above with "(a)"
centred below and whitespace between them, one 0.75 pt line with small heads, square corners, a
network as thin bars (`fig.nn`), frozen and trainable said in words (`fig.frozen`, `fig.trainable`),
and no icons unless the person asks; `figures check` (academic-look) counts cards, faces, clip-art,
colours, fill and corners. A gradient or feedback path stays short: it ends on the nearest part it
updates and runs in the clear band beside the row (`arrow({ route: 'under' | 'over' })`), never as a
loop round the figure (long-return); where the published figure has only a labelled arrow or a note,
draw that.

**Design before drawing.** For a new figure, from a method section or a typed request, first
write a three-line brief in the chat: the one idea a reader must get in five seconds; the data
the method operates on; the hero (the contribution) and what you leave out (tokenizer, patchify,
output embeddings and other routine steps become an arrow label or nothing). Then pick the layout
that makes the data its spine: a sequence through one shared model (a token strip of real words,
special tokens and image patches under a wide model bar, outputs above); two branches meeting at
their loss (teacher and student, online and target encoder with stop-grad); stacked blocks with
one block in detail; encoder → latent → decoder; frames unrolled in time; masked and unmasked
patch grids side by side. Draw the data, not a box naming it: never a "Text", "Image" or "Video"
box, a document icon or a crossed-out placeholder. Run `figures context`: if the manuscript has
no section on what you are asked to draw, say so and what you assumed; if a request conflicts
with the method's definition, follow the method and say so. If the person or Aster set the page
size, keep it and fill it; resize only a page you sized yourself. Do not ask about the page size
or offer another one (no "should I shrink it to 2.8 in?"): only when `figures check` prints a note
that the drawing leaves the page sparse, suggest that size once in your reply. Mark a deliberate
choice instead of working around the lint: `intentional: true` on a box whose size means
something, `fig.allow('uneven-spacing', ids)` or `fig.allow('empty-region', { x, y, w, h })`,
and say why in your reply. Scripts import the kit through `./aster-figures-kit.mjs` (a shim
`figures new` and `figures run` write), never through H's absolute path.

**Kit habits.** Mix words and math in any label: `'score $r_t$'` (plain words print in the figure
font). A junction's `at` is a share of the line as drawn; a point on a head moves to its base.
Use `fig.lanes` for a pair of opposite arrows (q / p_θ), `fig.zoom` to connect a box to its
detail panel, and `fork({ roles })` to style each branch. Templates scale with `h` / `size`
or fill a box with `fit: { w, h }`; transformer has `variant: 'post-norm'`; `two-stream` draws
two token streams meeting at one joint attention (MM-DiT, SD3). Size cards, bubbles
and networks with `fig.measure` first, and fix any kit warning `figures run` prints. Use
`fig.ellipsis` for ⋯; point an arrow at a group with `to: [ids]` or `fig.group`; `fromAt: { y }`
leaves a tall box at one height. A label wider than its short arrow (P(camera) on a 60-unit
run) becomes its own input: a text beside the arrow and a short arrow joining it (`to: { on:
'<arrow>', at: 'auto' }`). Let `loss()` place itself; if it throws, use the `cx, cy` it
suggests. Cut patches with `image({ patch, of })`; `image({ mask, prompt })` draws a
segmentation. For agent and reasoning figures, start from the `reflexion`, `prompting` or
`trajectory` template.

**Block diagram or illustration.** Method detail (one block, the training graph), an
architecture, a pipeline or a system is a block diagram in the paper look, the default. Only an
overview or teaser you draw as an illustration (what the method changes, compared with what came
before) leaves it, on purpose: `fig.style('illustrative', { panels: ['rose', 'teal'] })` gives
the rounded Nunito font and tinted rounded panels; draw the data (`bubble`, `nn` network glyphs,
photos), long plain arrows between stages, `cycle` for a loop, and the paper's one-line message as
a coloured `callout` on the flow ("maximum likelihood"). To
compare methods put them in side-by-side panels with the same data on both sides
(`panel({ same })` lines them up) so the difference is the only thing that changes (DPO vs RLHF).

**Illustrations.** Illustrate when the reader must recognise a physical thing: a robot arm, a GPU
rack, a camera rig, a sensor, a phone, a room the agent moves in (robotics, dataset, embodied
and systems teasers, overviews, pipelines). Never to decorate a block diagram, and
never a robot head for "the model", a brain for reasoning, a bulb, glow or sparkles; when the paper
has its own photos, use them (`image({ src })`). `figures kit illustrations <words>` searches the
drawn objects and bundled assets; `fig.illustration({ id, asset, x, y, w | h, roles, options })`
places one as a single vector image that repaints with the palette (`figures kit illustration`).

- One look for the whole figure, set first: `fig.illustrationStyle({ style, view, light })`.
  `flat` (no outlines, three tones from one light; teasers, pipelines, compute and data) is the
  default; `tonal` (thin same-hue outlines) suits close-ups of devices; `line` (ink outlines) method figures and the
  outline preset; `mono` print-mono. One projection (`iso` for objects and rooms, `oblique` for
  planes and stacks) and one light (`left`).
- Colour by role: objects are neutral; the accent goes on the one part the paper is about (the
  dataset, the arm being trained). `roles: { accent: 'neutral' }` quiets an object, `{ accent:
  'second' }` marks the other actor (the annotator, a baseline). At most two meaningful hues on
  the objects; in a world they are its `a` and `b`, and its tinted grays warm the bodies.
- Compose a scene rather than scattering clip art: `{ scene: [{ asset, at: [x, y, z], scale }],
  ground: 'tile' | 'room' }` in about-centimetre units, objects on the floor or on a `table`
  (`legs: false` is a workcell), shadows automatic, a path on the floor with a `{ layer: 'floor',
  draw: (b) => b.path(points, { dash }) }` item. Make each object 0.4 in tall or more at print.
- Labels stay native text outside the picture, in one column, joined by `fig.leader({ to:
  placed.anchors['arm.gripper'], at, text })` (a right-angle leader ending in a dot); arrows meet
  the picture's box. Leaders never cross another object.
- No asset fits: draw it with the builder in `draw: (b) => …` (box, cylinder, tube, sphere, prism,
  block; `figures kit draw`): fronts on the lit +y side, a shadow first, neutral bodies, the accent on
  one part, no text inside. Render, look at the print-size preview, fix, at most three rounds.
- `figures check` warns on mixed looks, lights or projections, lines under 0.25 pt, more than two
  hues, glow and clichés.

**Loops and feedback.** When the method is a loop (an agent that acts, is evaluated and
reflects; a data engine; RLHF's sample, score, update), the loop is the hero: put its stages on
one ring or one row with a single return path, draw that path in `role: 'main'` (`cycle` or a
`curve` in an illustration) and name what flows back on it ("reflection", "reward"). What sits
outside the loop (the environment, a memory) stays beside it and joins with ordinary arrows.
Feedback inside a block (a recurrent state, a memory written and read back, a residual) stays
inside that block's panel: a short `skip` or a return elbow beside the forward path in the `side`
weight, never a long arrow around the figure. Keep back arrows few, each labelled. A gradient or
feedback path ends on the module whose parameters it updates (the MLP θ inside the NeRF panel,
the policy), never on the region around it or a picture it passes on the way; `figures check`
(grad-target) says where to carry it. Run it in the clear band right under (or over) the parts it
passes, `arrow({ id, from, to, role: 'grad', route: 'under' })`, not round the whole figure:
`figures check` (long-return) warns when a return path reaches across more than half the page;
then end it on the nearest part it updates (DreamFusion's arrow ends at the NeRF block), or, as
NeRF's own figure does, leave the arrow out and say it in a short note. Parallel parts stay parallel: when the request says every
answer is a token sequence or every stage has a count, draw it on every one, not only on the one
you highlight.

**Figures beyond the method.** Pick the kind of figure first; each has its own spine. Each is
drawn in the paper look; the illustrative preset suits only a motivation figure or a teaser drawn
as an illustration; graphite or outline suits a grid of examples.

- _Data pipeline or dataset construction_ (`pipeline`, `funnel`): source → processing → final
  dataset, left to right, one stage per step with its rule as the note ("fastText en ≥ 0.65",
  "MinHash, 13-grams") and its count, so the shrinking shows ("5.8B → 2.1B → 140M"); stages
  carry no icons in the paper look (an icon such as `globe`, `filter`, `dedup` or `annotator`
  only in an illustrated teaser, or when the person asks).
  Show two or three real examples per stage: thumbnails, a text snippet, a duplicate crossed
  out at dedup. An annotator or a model in the loop is named on the stage it acts in. A data
  engine is one loop arrow from the dataset back to the stage it retrains. The final dataset is
  the hero, in the accent. Avoid a box per verb, missing counts, an icon legend, and more than
  six stages; fold minor steps into a note.
- _Motivation or teaser_ (`panel({ same })`, `subcaption`, `card`, `mark`, `chart`, `callout`):
  the problem vs. the fix, or prior work vs. ours, side by side on the same input, with "(a) …"
  and "(b) …" under the panels. Mark each output right or wrong with a line-art check or cross
  (`mark`, `card({ mark })`), highlight the phrase that differs (`card({ highlights })`), and
  add at most one mini chart with the number that makes the point (`chart`: 3–5 bars or two
  lines, ours highlighted, the metric above, no legend). Use a real question, answer and image,
  and put a one-line verdict under each panel ("forgets the start of the context ✗"). Right and
  wrong take the `good` and `bad` colour roles (green and red tints with an ink); they never
  count against the palette.
- _Qualitative examples_ (`examples`): inputs and each method's outputs in a grid, the same
  inputs for every method, column headers with ours in the accent, 2–4 rows. Text answers are
  cards with the decisive span highlighted and a check or cross; equal cells, no captions
  inside them.
- _Conceptual illustration_ (the illustrative look, chosen on purpose): `nn` network glyphs,
  `bubble`, `cycle`, `callout`, long plain arrows.

Never emoji. A numbered procedure takes `step` digits or `pipeline({ numbered: true })`; a span
that shares a property takes a `brace` with its label.

### Structure first, the paper's pictures, and shapes and arrows that mean something

**Structure first.** In the design brief, list the key structural motifs the paper's text names,
then draw each as structure, never as a row of boxes (`figures kit structure`):

- a U-Net or encoder–decoder: its U-shape (or LDM's hourglass), the resolution levels and the
  skip connections between matching levels: `fig.unet({ shape: 'u' | 'hourglass', levels,
  resolutions, blocks })`, wired in at `in` and out at `out`; its cards fit their labels (side by
  side, or stacked in a half on a small page) and take your own `{ label, color }`, so never
  redraw the U-Net by hand (`figures kit examples unet-skips`);
- a state that fans out (Mamba's N state lanes into A, B_t and C_t; one embedding into several
  heads): draw every wire, never one block for all of them. `fig.rails({ from, to, ys, through:
  [bars] })` runs N lanes through each bar so every component meets every bar with no crossing,
  in the state's hue at the `side` weight (thin, never heavy black bars); `fig.bus` wires one box
  to several (or several to several) port to port in nested elbows; one `fig.fork` sends the
  projection into the bars (`figures kit examples state-fanout`). Two encoders with two outputs
  each always cross: outline the pair as one block and run one bus from it (`encoder-pair`);
- a loop (Voyager's curriculum proposing tasks, an agent's act–check–refine cycle, a data
  engine): the items on a ring joined by arcs (`fig.ring`), or one row with its return path
  drawn, never a row of steps with no way back;
- what feeds back where (a passed check adds a skill, a failed one refines the program, progress
  updates the curriculum), and the indices that tie parts together (vertex numbers to table rows).

Record them before drawing: `fig.structure({ loops: [[ids in order]], fanouts: [{ from, to }],
skips: [[from, to]], feedback: [[from, to]], text: '<the sentence from the paper>' })`.
`figures check` warns `missing-loop`, `missing-fanout` or `missing-link` for each one the drawing
does not connect, says when a loop's items sit in a row, and warns when the text says the method
loops but no cycle is drawn.

**The paper's own pictures.** When the project has the paper's images (`data/<figure>/`), they
are the figure: show them large, half an inch (72 units) or more each and the key one larger;
fewer, larger pictures beat a row of thumbnails. `image({ src, w, h })` fills the slot (cover,
with a kit warning when it cuts over a third), `fit: 'contain'` keeps the whole picture, `view`
(0–1) or `crop` (pixels) picks a part such as one sprite-sheet cell, and `patches({ src, rows,
cols })` cuts a picture into a patch grid. `small-picture` warns below a third of an inch; icons
(crops of 64 px or less, or `icon: true`) stay small. `image` places at once, await or not.

**Shapes and arrows that carry meaning.** Hand-drawn figures do not draw every part as the same
pastel rounded box with black arrows (`uniform-look` warns). Give a shape its meaning: a
trapezoid for an encoder or decoder, `fig.cylinder` for a store (a memory, a skill library, a
replay buffer), a `stack` for a set, a `node` or plain text for an operation (⊕, concat,
softmax), boxes for modules. Where the paper tells flows apart, colour arrows by what flows, in
the world's tones: `role: 'cond'` (conditioning, retrieval, a side input; ink in the paper look), `'grad'` (gradients,
backpropagation), `'feedback'` (an output fed back), `'good'` / `'bad'` (a check that passes or
fails), `'skip'` (skip connections, dashed); the rest stay `data`. Two or three coloured roles
read hand-made; never colour every arrow, and keep one quiet shape language.

**Arrows and labels.** Leave 16 units (8 pt) or more between the shapes an arrow joins (the kit
shortens the end gaps of close shapes so a shaft remains). An arrow label wider than its run
places itself (`labelPosition: 'auto'`: the other side, along the run, past an end, or broken onto
two lines); `labelPosition: 'above' | 'below' | 'head' | 'tail'` picks a place, `labelOffset`
moves it by hand. Arrow and lane labels of several
words print as plain words ("New Task", "Env Feedback\nExecution Errors"); math stays TeX (x_t,
`$…$`, a lone symbol). `fromAt: { y: 0.3 }` is a share of the side as well as a coordinate, and
picks the left or right side. A deliberate long return path takes `fig.allow('many-bends',
[id])`; a figure that is one colour on purpose, `fig.allow('monotone-figure')`. `fig.allow` takes
only the rules `figures kit allow` lists; for the others (text-over-shape, small-glyph, stub-arrow)
it prints how to fix them. A colour that is data (a pixel's colour, a rendered value) is
`box({ fill: '#hex', swatch: true })`; `image({ …, icon: true })` keeps a picture small on purpose.

**Operators, switches and code.** `node({ symbol: 'minus' })` for ε̂ − ε, `'concat'` for a
concatenation (never a plus), `'plus'` for a sum; a routing choice (a conditioning switch) is
`fig.switch` (ports `<id>-in`, `-out0`, `-out1`). An agent's program goes in `fig.code({ code,
highlight: [{ line, text }] })`, which keeps indentation in a monospace font; `card` is for prose.
A legend keys arrows and operators too: `legend({ items: [{ label, role: 'cond' }, { label,
swatch: 'switch' }, { label, symbol: 'concat' }] })`.

**A page set for you.** When the person or Aster set the page, keep it. If the content does not
fit (`page-overfull`: stub arrows, labels on heads and text over shapes at once), compact it and
keep everything the request names; merge only what you added, turn routine steps into arrow
labels, and say in the reply anything you left out; `fig.setPage` on their page prints a kit
warning.

**Small pages:** when the person or the task sets a page 1.1–1.9 in tall, or a single column with
many parts, keep text at 7 pt (14 units) or more and pictures at 0.5 in (72 units) or more, and keep
everything the request names: every module, label, formula, listed item and the legend it asks for
(`fig.legend({ asked: true })`). Compact first: shorter words for what you added, labels stacked on
two lines, gaps of 8 instead of 16, one shared legend row, a formula inline beside its symbol (`z
\in \mathbb{R}^{h \times w \times c}` next to z) or on a short second line; only then merge or drop
what you added yourself (a routine step becomes an arrow label). Nothing may overlap: when a formula
has no room, move it under its panel, shorten it (`\mathrm{softmax}(QK^T/\sqrt{d})V`) or stack it on
two lines a full line apart, and keep 4 units between it and any box, line or word (`figures check`:
text-overlap, paper-overlap, arrow-over-text). `figures check` (small-page) lists what to compact,
and your reply says anything you left out.

**Plots in these figures.** `figures kit data` opens with a find-by-task index: optimiser paths
on a toy loss are `ap.toy.fn(name)` (`sharp-flat` is Sophia's) and `ap.toy.optimize(f, start,
method)` (gd, sign, adam with `betas=(0, 0)` for Adam without averages, diag-newton for
per-coordinate Newton, sophia…). Compare methods each in its own hue: the check allows the
accent and three other hues, so `ap.series(n, ours=i, hues=True)` for up to four and a gray for a
fifth (`ap.surface(styles={name: {'color': …}})` on a surface); never grays told apart only by
dashes. Make a 3D surface the hero of its panel and let `ap.view3d` pick the view. A plot made
with `panel=True` and placed with `fig.plot({ figure, w, h })` is rendered at that cell's size.

### Distributions, trajectories, 3D and plots in a diagram

When the idea is a distribution, a sampling process or an optimisation, draw it, not a box that
names it (`figures kit science`, `figures kit plots`). The glyphs compute what they show, so keep
their seeds fixed and reruns match.

- _Densities and flows_: Distributions and trajectories are computed, never drawn as stacked circles
  or hand-placed lines: `fig.density` draws a real density as filled contour bands (thin unfilled
  lines for an intermediate p_t), `fig.flow` computes p_t, the sample paths (the marginal ODE, an
  SDE, OT or independent pairs) and the velocity between two distributions; for real data or a shape
  beyond the presets, plot it in Python and place it with `fig.plot`.
  `fig.density({ id, dist, style: 'filled' | 'line' }, box)`: presets gaussian, mix8, moons, rings,
  spiral, checkerboard, banana, data (two modes and a neck), blob; `{ mean, cov }` a full-covariance
  Gaussian, `{ components }` a mixture, `{ points }` a KDE.
  `fig.flow({ from, to, coupling, paths, snapshots }, box)` draws the published look by default:
  noise left, data right as filled bands, p_t between as thin contours, 40 thin translucent paths
  and one bold example (`coupling: 'marginal'` curved ODE paths, `'ot'` or `'independent'` straight
  pairs; `sde: 0.2` jagged paths with the same p_t); `velocity: true` adds u_t^θ along the example,
  `{ compare: true }` u_t(x) against u_t^θ(x) (a training panel);
  `pictures: { x0: 'noise', x1: 'dog' | 'data/<figure>/x.png' }` adds X_0 / X_1 thumbnails.
  `layout: 'overlay'` (both centred: moons inside 8 Gaussians, I-CFM against OT-CFM), `'strip'` (p_t
  in a row of panels), `'planes'` (p_t on planes along a time axis, the paths passing through:
  interpolant and diffusion teasers, ODE beside SDE with one seed). A flow-matching blueprint is
  four `fig.flow` calls with one `from` and `to` on `teaserGrid` panels; start from
  `figures kit examples flow-blueprint` (or `interpolant-planes`, `coupling-compare`). `density2d`,
  `snapshots` and `pathDensity` are older names drawn the same way;
  `pathDensity({ layout: 'band' })` draws 1D conditional bands (`profiles: 6` as curves in rows). `flowPaths` joins two densities in
  boxes of their own; `trajectories` draws 1D paths between two profiles, ODE beside SDE.
- _Scores and velocities_: `field({ kind: 'score', of })`, `field({ kind: 'flow', from, to, t })`.
- _Optimisation_: `surface3d` with `paths: [{ from, lr, momentum }]` (descent computed on the
  surface) beside its `view: 'top'` contour map: `template('loss-landscape')`.
- _Representation geometry_: `manifold` (a Swiss roll; `paths` geodesic vs chord), `sphere`
  (geodesics on a hypersphere).
- _Concept geometry and state graphs_ (`figures kit schematic`): `curveManifold` draws a data
  manifold as a curve in 2D with offset `shells`, points `on` and `off` it, a `tangent` and
  `projections`; `ellipse` a rotated blob or a covariance's sigma rings (`cov`); `curve` an arc or
  an S for what moves along a curve; `loop` a self-transition. A state graph (an HMM, a Markov
  chain): states as `node` or ellipse `box`, one `curve` per transition (opposite pairs bend
  apart), a `loop` per self-transition, labels a few characters each. Connectors between boxes
  stay horizontal and vertical.
- _Time and dynamic scenes (4D)_: `spacetime` stacks a video's frames along t with object
  `tracks` threading them; `scene3d` draws boxes, spheres and point clouds that move along a
  `path` (or `to` with `arc`), with fading trails, `ghosts` and camera frustums (NeRF, 3DGS:
  the input views and a novel view); `snapshots3d` shows that scene at several times on one
  camera; `tesseract` is the 4D hypercube. Key any time colour with one `timebar` (every
  time-coloured glyph shares its gray → accent rule). Start from `template('dynamic-teaser')`.
- _A row of (a)–(d) panels_ (a generation teaser): `fig.teaserGrid({ id, panels: ['(a) Data',
  …] })` sizes equal panels to the page with the quiet outline and captions, and returns `sizes`
  (labels 16, math 18, dots r 2.5, the highlighted path 2.5 on a 6.75 in page) and each panel's
  `body` and `slots(3)`; pass a panel as the box of `fig.flow` or `fig.density` (its body is used).
  Use those sizes rather than the 7 pt floor; when
  it warns that panels are too narrow, use `rows: 2` or fewer panels.
- _Real numbers_: make the plot with the plot layer (Data figures), at the size it is shown
  (`ap.figure(size=(w / 144, h / 144), panel=True)` for a w × h unit cell) and without its own
  panel labels when the diagram labels it. Name it after the drawing, `<drawing>-<part>`
  (`g2-otcfm-flows`), never the drawing's own slug. Place it with `await fig.plot({ id, figure })`
  (`x, y, w, h, fit: 'exact'` for a plot made at that cell; `fit: 'width' | 'height'` scales from
  one side), several with
  `await fig.plots({ id, grid: [1, 3], items: [{ figure }], labels: '(a)' })`, and aim an arrow or
  a label inside with `fig.plotPoint(id, { panel: 'a', data: [x, y] })`. It stays vector in the
  PDF. After the plot is rendered again, run `figures refresh --figure <diagram>` (or rerun the
  diagram's script); `figures check` reports a stale one. `await template('teaser', { plots })`
  sets a schematic beside two plots.

Check before you finish: in a quiet preset one accent for the data or the method, priors, noise
and baselines gray; in a world the input or prior (`d`), the output (`b`) and ours (`a`) one hue
each, the one baseline ours is compared with in `d`, several baselines gray (`science-hues`); plots take the same palette (`ap.use(world)`: `ap.series` gives its hues, ours
first, then the given baseline; `ap.cmap('world' | 'div' | 'surface')`); six contour levels (the default) or fewer on small densities; 40–120 samples and dozens of thin paths with one example; dots r 1.5 or more;
a mesh of 14–20 cells a side; plots at their natural size (`plot-small-text`, `plot-scale`,
`plot-distorted`) and no stand-in left (`plot-stand-in`); math at 7 pt or more at print
(`small-math`). Paths, contours and meshes may slant;
arrows between items stay horizontal and vertical.

**How to show the objective.** Papers vary it, and the full formula usually lives in the text, so
draw the loss the way this figure needs it, in ink, and put the whole objective in the caption
you propose. `loss({ form })`:

- `name` ("L1 loss", "cross-entropy", "contrastive loss"; runs mix words and math) or `symbol`
  (`\mathcal{L}_{DPO}`, `H(P_t, P_s)`): a method block diagram. MAE and DINO print a short label
  or symbol beside the two outputs.
- `compare`: no node, a two-headed link (or `link: 'bracket'`) between prediction and target with
  a small label ("ℒ₁", "match"); V-JEPA writes "L1" on the link.
- `formula`: only when the equation itself is the point of the figure.
- `none`: a teaser or an illustration leaves it to the caption; predictions and targets stay
  marked. The DPO teaser has no formula: its arrows say "maximum likelihood".
- Several losses: names or symbols, each beside what it compares, the formulas in the caption.

No frame by default (`boxed: true` gives a thin gray one), ordinary links (`links: 'dashed'` for
dashed ones), at least the size of a component label. Let the kit place it: it lands between
prediction and target, clear of other items, and two losses each sit beside what they compare
(`side` only to override). A note about it goes in `loss({ note })`, never loose text under it;
teacher-forcing rings join on the side away from the input arrows (`join` chooses). Keep its links short and out of the
arrow field: a dashed link never crosses a solid arrow and runs under a quarter of the page
width. Colour only when the person asks (`tone: 'accent' | 'red'`), or when two losses must be
told apart, then in the figure's own hues.

**What a paper figure shows.**

- Every term of the training objective, each loss over everything it covers: predictions and
  targets stay separate tensors, each framed on its own, that meet only at the loss
  (`loss({ predictions: [...], targets: [...] })`, `compared`, `highlight` for patch-wise
  alignment); the kit places it a short stub from the sets, between them when they are
  stacked. Teacher forcing: the targets are the inputs shifted by one, interleaved with other
  tokens, so ring each (`group: 'rings'`) under one link. A preference loss (DPO, Bradley–Terry)
  links the two models' outputs (`inputs`); an RL objective links the reward and the policy's
  samples.
- The one detail that names the method, drawn: the masking step, the time axis, which positions
  the loss covers, a zero-initialised gate ("α = 0"), the conditioning inputs (timestep and class
  label).
- One colour scheme by role (the palette rule under Style; a legend only as it says): trained modules in the accent (in a world, each
  trained module type its own hue, ours in `a`), frozen modules gray (`frozen`);
  `trainable(id)` and `frozen(id)` only when the figure mixes trained and frozen parts: in the
  paper look they write "trainable" and "frozen" in small muted words on the module's corner (one
  "frozen" on a frozen group's panel covers its modules); the flame and snowflake signs belong to
  the illustrative look, never emoji. EMA copies are gray with no mark (they are not frozen); a
  module frozen in one stage and trained in another gets a note under the loss. When everything trains, the accent marks only the contribution.
  Predictions tinted (`predicted: true`), targets gray.
- Weight follows the contribution: ordinary flow is the default `data` arrow (gray);
  `role: 'main'` (ink) is chosen on purpose for the paper's contribution path, not
  automatically the data or residual path (in DiT the conditioning is the contribution); `side`
  for side inputs, `aux` for EMA and stop-grad (dashed). In the paper look every role is one
  0.75 pt line with small heads; the preset's own look draws data at 1 pt, main at 1.25 pt.
- Arrows run only horizontally and vertically: straight where two shapes share a row or column,
  else one sharp elbow (two at most) that the kit routes around other boxes; never slanted
  (`allowDiagonal: true` only when the slant means something, `curve` for loops in
  illustrations). Residuals are `skip`, one-to-many `fork`, many-to-one `merge`; a junction's `at`
  is where its dot goes. Boxes sit on an 8-unit grid; rows and columns line up exactly and are
  evenly spaced; `measure` sizes things before you place them.
- Groups as titled panels (`panel({ around, title: 'DiT block ×N' })`; `outline: true` is a
  thin square line, `'dashed'` only for an optional or repeated group; a title starting "(a)"
  makes a sub-figure in whitespace, its title above and "(a)" below); boxes sized to their
  label with 6–8 pt of padding (a shared bar spanning its inputs takes `bar: true`); notes and
  masks beside what they explain; two text sizes on every page, 8 pt (16) and 7 pt (14), nothing
  smaller, and no gray words fainter than the preset's `muted` (its quiet gray, #666 in graphite);
  math with scripts
  at label size (16), so its scripts stay 5.5 pt or more; labels a few words in the paper's
  notation; no prose, the caption explains. A double-column page you size yourself
  stays 2.8 in tall or less.
- Data glyphs: the project's own sample images (`image({ src })`) when it has some; otherwise CC0
  photos stand in (`image({ kind: 'cat' })`): ask the person for a few samples or a dataset
  folder. Icons (`icon`, `figures kit icons`) are left out in the paper look: name actors,
  modalities and tools in words or draw them as what they are (a cylinder for a store, pages for
  documents); an icon only when the person asks (`icon(name, { asked: true })`) or in an
  illustrated teaser. Common architectures have templates (`template('transformer' | 'moe' | 'lora'
  …)`, `figures kit templates`); vary a template to the paper rather than copying its default
  (`template('dit', { h, w, tokens, variant: 'adaLN-Zero' | 'in-context' })` fills a tall page
  and shows the latent tokens in and out). The person's saved parts are in `figures kit
  library`, and `savePart(name, ids)` saves one when they ask.

**Style.** The prompt says who chose the style: keep the person's choice; when Aster's default
applies, pick the palette by the paper's world. Each figure has one palette, kept on its page:
`fig.style(name, { accent })`; `figures kit colors` shows them. The palette only supplies the
hues: what makes a figure look generated is colour by component type (every Linear pink, every
norm beige, four or five pastels at one weight, each outlined in a darker shade of itself). In
16 published figures (round 17) the contribution, when emphasised, is 2 to 6 times a normal part
and its colour appears nowhere else; most use ink lines, white or pale fills and three hues or
fewer, each with one meaning. So declare the design (`figures kit design`) and let save() paint it.

- Method, overview and teaser figures take the world of the paper: `vision` (3D, NeRF, Gaussian
  splatting, video, perception, vision-language; photos and renders beside it), `generative`
  (diffusion, flow matching, image, video and audio generation), `language` (language models,
  reasoning, alignment, LLM agents), `robotics` (robots, embodied agents, RL, world models),
  `training` (optimisation, loss landscapes, training dynamics, scaling) or `systems`
  (efficiency, hardware, memory, parallelism, serving, data pipelines). Role names still work:
  `color: 'input'` or `'data'` (d, what is given), `'model'` (c, the machinery), `'output'` (b,
  what the method makes), `'a'` (ours, the paper's part), `'frozen'` (icy gray); with a declared
  design (`fig.focus`), save() keeps the accent for the focus, a pale hue for the one
  `fig.colourBy` dimension, and turns every other role colour into ink on white. Parts:
  `-strong`, `-ink` (a key phrase), `-solid` (a ray, a marker), `-stroke`, and `-light`/`-dark`
  for the lit and turned faces of a 3D shape (one hue, never a glow). Text stays ink; arrows ink
  unless the arrow is the thing (a ray in `d-solid`, the gradient flow in `a-ink`).
- **The palette rule** (Aster's prompt says the same). Colour by meaning: ink on white for every
  part, one accent for the paper's contribution alone (`fig.focus([...ids])`), and at most one more
  colour, only for one declared dimension (`fig.colourBy('stream' | 'modality' | 'trainable', {
  value: ids })`); published figures use three hues or fewer and the contribution's accent appears
  nowhere else. Never colour by component type (no hue per module, no pastel per stage), never a
  pastel fill outlined in a darker shade of its own hue (a neutral thin line or none), never one hue
  for two meanings; worlds, presets and templates still pick the hues, and save() maps them to this.
  Panels are never cards: sub-figures sit apart in whitespace, a group (`fig.panel`) is a thin
  square neutral line, and only a declared region (the focus's or a dimension's) takes a pale tint.
  Text stays ink; arrows stay gray or ink, the focus's own path in the accent.
- **The design pass** (Aster's prompt says the same). Design pass: declare the focus (the
  contribution) with `fig.focus` before saving, so it alone takes the accent, a 1 pt outline and a
  label a step larger, and make it lead by size (1.6 to 6 times a typical part) or by place. Each
  fact appears once; refer, don't repeat: a second place points to it with an arrow, the same colour
  or a symbol, never the same words, value or picture again. Peers share one size, gaps come from
  one small scale (8, 16, 24), at most three box styles and three text sizes, no stacked token chips
  (one clean strip when the tokens are the point), pictures in a row the same size, no caption
  without its picture. After the first render run `figures critique`, make the cuts it lists before
  any polishing, then render and critique again.
- No prose in the figure: labels of a few words in the paper's notation, the caption explains. A
  legend only when three or four roles need a key or the person asks for one (`fig.legend`, small,
  beside or above the panels).
- A single accent is right only for a minimal figure: a plot or a small diagram with one thing
  to point at (graphite, slate, outline, tonal; ours vs. given in blue-amber, kinds in
  categorical, no hue in print-mono). The same role names work there (gray and the accent).
- Any `accent` (a swatch or #hex) is derived into tint, strong, ink and solid; in a world it
  becomes `a` and a near hue moves aside. Colour by role names, never library hex. Math is typeset by
  MathJax; `\text{}` comes out serif, so mix words and math with `text({ runs })`. `figures check`
  notes a monotone figure (one hue, or gray, on more than three module types) and warns when a
  figure looks generated: vivid outlines in the fill's own hue, one pastel step for every
  hue, library default colours, violet by default, red off a red loss, prose, legends,
  placeholders, faint gray words or content, hairline arrows, boxes over 60% empty, one tint
  behind everything, arrows over text, long detours, routes with many bends or along a shape's
  edge, a return path across more than half the page, a loss link across a data arrow or a loss
  name floating alone, uneven spacing, a lone flame badge, data glyphs under 24 px at print, empty regions, a page over a fifth blank, short dashed
  links, or a double-column figure taller than 2.8 in. Slanted arrows and boxes a few units off their row or column are ERRORs.

**Before you render, check correctness against the method's text**, not the request's
wording: when they disagree, draw the definition and say so in your reply. These slipped before:

- Signs and relations: DINO's centering subtracts (−c) even if a request says "+c"; a sampled
  init is `A ∼ N(0, σ²)`, never `=`; noise is added at a ⊕ node, not a bare junction.
- Direction: memory is read into the actor (memory → Actor) and written by reflection
  (reflection → memory); the mask is derived from y to x (V-JEPA); next-token targets are
  shifted by one (each output sits over its source token and is the next one; positions without
  a loss stay empty slots).
- Every target has an incoming edge from its true source; masked-only targets and stop-grad are
  drawn; every intermediate tensor is labelled; stages are linked (the SFT model initialises the
  PPO policy).
- Scope: everything the request names is there (all of CLIP's panels, zero-shot included).
- One worked example: the same image, clip or prompt runs through every stage (a pipeline's
  thumbnails, REPA's alignment), so the reader follows one thing.
- One reading direction: left to right for pipelines, bottom to top for stacks; no second row
  that reads right to left. A cycle runs clockwise with the environment at the bottom.
- Size carries meaning: draw the method's asymmetry into the geometry. MAE's decoder is about a
  third of the encoder; LoRA's W is square beside an r-wide waist; DINO's student and teacher
  are the same width, the teacher's histogram sharp and the student's flat; Switch's router
  picks a non-adjacent expert. Inputs take at most a quarter of the width; empty boxes shrink.
- Colour by meaning, not by type: the accent on the contribution only, one more hue only for a
  declared dimension (modality, stream, trainable vs frozen), never one tint per operation type
  (attention, FFN, norm stay ink on white); predictions and targets marked the same way
  throughout; velocity or noise outputs drawn as images, not feature grids; concrete data (video
  frames on a time axis, captions that match their thumbnails).
- Structure: module boundaries as panels, "×N" markers, consistent arrow weights. Frame only the
  groups a reader must see as one (two or three a figure) with a thin square line; never a gray
  rounded card around every stage: whitespace and a title separate the rest.
- Legibility and space: text 7 pt or more at the final width; token chips, patches and crops
  24 units or more; a lone input image about a tenth of the page width; no box more than 60%
  empty; no placeholder that shows nothing (a blank thought box, a ghost output: show words,
  cells or a thumbnail at 3:1 or more). Crop to the content and fill the page (about 2:1 to 3:1,
  under a fifth of it blank), with short connectors. When the page was set for you, fill it and
  keep it.
- The loss sits beside the two things it compares, one short link each, never across a data
  arrow and never as a name floating on its own.

**Look at what you drew.** After every edit run `figures check` and fix each ERROR, then
`figures preview` (it says when and from which scene hash its PNG was rendered), open the PNG
(and the copy with each lint finding boxed in red, when it prints one) and judge it: is the idea clear in five seconds; is the data shown, not named; is the whole
objective there; one hero; colours by meaning; no empty boxes or regions; labels clear of arrows and
heads; would a reviewer call it a generic flowchart? After the first render run `figures critique`:
it prints the focus and whether it leads, each colour with its meaning, what is said twice, the
size and spacing spread and the box styles and text sizes, then the cuts; make the cuts (drop the
repeats, quiet what competes, merge styles) before any polishing. Before you finish, open the print-size PNG
it also prints (150 dpi, the figure's width on paper) and check every label is still easy to
read. Fix and repeat, at most three rounds. When `preview` times out while Aster is connected, it
is almost always still rendering: run it again with the longer `--wait` it names, and only if that
times out too, go on from `figures check` and say so in your reply. When it says Aster is not
connected, do not wait longer: go on from `figures check` and say the preview appears once Aster is
running and connected. When it prints a WARNING that the PNG is
blank, the scene has something Aster cannot draw: fix that before judging anything.

**The person edits the same figure.** The person may move, resize, relabel, recolour, lock, delete
or add things on the Figures page's canvas. Aster keeps those hand edits in
`<figures>/src/<slug>.edits.json` (beside the script; commit it with the figure) and puts them back
after every run of your script, so a rerun never undoes them; the person's edit wins where your
script set something else. `figures run`, `figures check` and `figures preview` list them ("'Encoder'
(enc): moved 12 right"), what your last run changed that the person had set, and edits whose
element your script no longer draws. Build on them: keep their ids, lay the rest out around them,
and do not "fix" what the person placed by hand (`figures check` reports such findings as notes).
To change something they edited, ask them first; once they agree, `figures edits --figure <slug>
--release <id>` lets your script set it again. For a few small changes without rerunning the
whole script, `figures edit --figure <slug> --set enc.dx=8 --set lbl.text=z_t` patches the scene
(a move carries the label and bound arrow ends along) and refuses what the person set by hand;
make the same change in the script too, or the next run puts the old value back.

**Draw with the kit.** One Node script, `<figures>/src/<slug>.figure.mjs`, imports the kit through
the shim beside it (`./aster-figures-kit.mjs`) and draws the whole figure; run it with `figures
run`. `figures kit` prints a one-line index of every function; `figures kit <topic|name>` (or
`box,arrow`) prints their options and defaults, so there is no need to read the kit's sources.
Adding an id that exists replaces it (arrows bound to it stay bound), so rerun the script after
each fix; an id used twice in one run is an error. Lay items out (`row`, `column`, `align`,
`distribute`) before drawing the arrows between them.

<!-- prettier-ignore -->
```js
import { openFigure } from './aster-figures-kit.mjs' // the portable shim, never H's path
const fig = await openFigure(new URL('../method.excalidraw', import.meta.url)) // beside src/
fig.reset() // a full redraw: clears all but the page and its areas
fig.style('generative') // the paper's world; 'graphite' only for a minimal figure
const seq = fig.tokens({ id: 'in', x: 16, y: 240, boxed: false,
  items: ['A', 'cat', '<BOI>', { image: 'cat', view: { x: 0, y: 0, w: 0.5, h: 0.5 } }, '<EOI>'] })
fig.box({ id: 'tf', label: 'Transformer', x: 16, y: 170, w: seq.width, h: 44, bar: true, color: 'model' })
for (const t of seq.cells) fig.arrow({ id: `${t.id}-up`, from: [t.x + t.w / 2, 236], to: [t.x + t.w / 2, 218] })
fig.box({ id: 'enc', label: 'encoder', math: 'E_\\theta', x: 340, y: 40, color: 'a' })
fig.focus(['enc']) // the contribution: it alone takes the accent; everything else ink on white
console.log(await fig.save()) // { errors, warnings, notes }
```

- **Math** is TeX (double the backslashes in a JS string): `x_t`, `s^{(i)}` (brace scripts),
  Greek and symbol macros, `\mathcal{L}` (printed L), accents in scripts (`E_{\bar\theta}`); arrow
  `label` prints words as words and math as TeX, `labelText` exactly as written.
- **Page.** Scene units, x right, y down; 144 per inch, so 1 pt is 2 units. The page is the locked
  frame `figure-page` at (0, 0): single column 3.25 in (468) wide, double column 6.75 in (972);
  the height follows the content: `fig.setPage({ heightIn })`. Keep 12 units of margin and fill
  the rest; arrows straight or one elbow, never through a box, short and local. Elements on the
  page carry `"frameId": null`; never move the page.
- **Elements.** Every element has `id`, `type` (`rectangle`, `ellipse`, `diamond`, `arrow`,
  `line`, `text`, `frame`, `image`), `x`, `y`, `width`, `height`, `angle` 0, `strokeColor`,
  `backgroundColor`, `fillStyle` "solid", `strokeWidth` 2, `strokeStyle`, `roughness` 0,
  `opacity` 100, `groupIds`, `frameId`, `roundness` (`{"type":3,"value":4}` or null), `seed`,
  `version`, `versionNonce`, `isDeleted` false, `boundElements`, `updated`, `link` null, `locked`
  false. Text adds `text`, `originalText`, `fontSize`, `fontFamily` 20 (the paper look's Latin
  Modern Roman; 21 TeX Gyre Termes; 9 Liberation Sans in a preset's own look; no bold or italic),
  `textAlign`, `verticalAlign`,
  `containerId`, `autoResize` true, `lineHeight` 1.25. A label in a box is text with
  `containerId` = the box, listed in its `boundElements`. An arrow's `points` are relative to its
  `x`/`y` start; `startBinding` / `endBinding` are `{"elementId","focus","gap"}` and each bound box
  lists the arrow.
- **Generate in area.** A request names an area: a `frame` whose `customData.asterArea.prompt`
  holds the request, with its id, bounds and the shapes just outside it. Replace only its
  contents: delete the elements whose `frameId` is the area id (and text bound to them), then add
  new ones with `"frameId": "<area id>"`, each inside x..x+width and y..y+height. Outside it you
  may only add arrows with `"frameId": null` that connect an element inside to a listed neighbour,
  and add those arrow ids to the neighbour's `boundElements`; change nothing else outside, and
  never move, resize or delete the frame. Area names do not print: draw a title text if the block
  needs one. Run `figures check --area <id>`.
- **Recreate from a reference.** A request names a reference image under
  `figures/references/` (kept out of Git); the page records it, so `figures check` keeps the
  reference's colours instead of the style rules. `figures reference` prints its scale and colour
  regions in scene units: build from those numbers with `exact` sizes and `gap` 0 to 1.
  `fig.setPage({ matchReference: true })` gives the page its shape. Photos are `await fig.photo({
  id, x, y, w, h, crop: { x, y, width, height } })` with the crop in reference pixels; a crop
  copies whatever crosses it, so cut it to the photo alone. Excalidraw has no bold, italic, serif
  or dash-dot: regular text at the reference's size, a heavier `strokeWidth`, `dashed`. `figures
  preview` also prints a compare PNG (reference beside preview) and an overlay (preview over a
  faded reference): open the compare PNG, go region by region, fix, and stop after four rounds
  saying what still differs.
- **Selection and sketches.** A request about a selection lists element ids: change only those,
  adding connecting elements next to them when asked. A sketch arrives as an image path: open it,
  keep its arrangement, tidy the alignment, use the manuscript's terms for labels, and redraw it in
  the same place (`figures show` gives the image's units per pixel). Then delete the image element
  and its entry in `files`.

One box with its label and an outgoing arrow inside an area (the elements, in file order):

<!-- prettier-ignore -->
```json
[
  {"id":"area-1","type":"frame","name":"Encoder","x":40,"y":40,"width":240,"height":120,"angle":0,"strokeColor":"#bbb","backgroundColor":"transparent","fillStyle":"solid","strokeWidth":1,"strokeStyle":"solid","roughness":0,"opacity":100,"groupIds":[],"frameId":null,"roundness":null,"seed":1,"version":1,"versionNonce":1,"isDeleted":false,"boundElements":null,"updated":1,"link":null,"locked":false,"customData":{"asterArea":{"prompt":"an encoder block"}}},
  {"id":"enc-box","type":"rectangle","x":60,"y":70,"width":120,"height":56,"angle":0,"strokeColor":"transparent","backgroundColor":"#e8e8e8","fillStyle":"solid","strokeWidth":2,"strokeStyle":"solid","roughness":0,"opacity":100,"groupIds":[],"frameId":"area-1","roundness":{"type":3,"value":4},"seed":2,"version":1,"versionNonce":2,"isDeleted":false,"boundElements":[{"type":"text","id":"enc-label"},{"type":"arrow","id":"enc-out"}],"updated":1,"link":null,"locked":false},
  {"id":"enc-label","type":"text","x":91.1,"y":88,"width":57.8,"height":20,"angle":0,"strokeColor":"#1e1e1e","backgroundColor":"transparent","fillStyle":"solid","strokeWidth":1,"strokeStyle":"solid","roughness":0,"opacity":100,"groupIds":[],"frameId":"area-1","roundness":null,"seed":3,"version":1,"versionNonce":3,"isDeleted":false,"boundElements":null,"updated":1,"link":null,"locked":false,"text":"encoder","originalText":"encoder","fontSize":16,"fontFamily":9,"textAlign":"center","verticalAlign":"middle","containerId":"enc-box","autoResize":true,"lineHeight":1.25},
  {"id":"enc-out","type":"arrow","x":184,"y":98,"width":80,"height":0,"angle":0,"strokeColor":"#585858","backgroundColor":"transparent","fillStyle":"solid","strokeWidth":2,"strokeStyle":"solid","roughness":0,"opacity":100,"groupIds":[],"frameId":"area-1","roundness":null,"seed":4,"version":1,"versionNonce":4,"isDeleted":false,"boundElements":null,"updated":1,"link":null,"locked":false,"points":[[0,0],[60,0],[80,0]],"lastCommittedPoint":null,"startBinding":{"elementId":"enc-box","focus":0,"gap":4},"endBinding":null,"startArrowhead":null,"endArrowhead":"triangle","elbowed":false}
]
```

### Perspective scenes

When the method lives in 3D (rays through pixels, cones, cameras around an object, tri-planes,
voxel grids, stacked feature maps), draw the geometry in 3D with `fig.perspective`
(`figures kit perspective`), never as parallel lines, flat wedges or squares in a row. One scene is
one vector image through one camera; labels, arrows and boxes stay native around it.

**When to reach for 3D.** Draw in 3D when the reader must see where things are in space or what
light and a camera do to them: rays and cameras, volumes holding a field, objects a robot acts on,
a surface whose shape is the point. A pipeline of modules stays flat even when its data is 3D; a
scene that only decorates stays out. One look for every 3D part, set first: `b.look({ shading:
'cel', outline })` for an illustrated scene, objects on a `b.floor` with a `b.light({ at })` so they
cast shadows (a depth cue `figures check` counts), meshes for objects (`b.lathe` a cup, `b.ellipsoid`
a ball, `b.blob` a cell, `b.tube` a path, `b.surface` a landscape, `b.mesh` anything else), splats
(`b.gaussian`) for Gaussians, and pictures on faces (`b.box({ photos })`, `photo: { wash }`).
Panels showing one geometry share a camera with `fig.perspectives({ scenes })`. Fields rendered
by a camera are the `volume-boxes` template (`figures kit examples object-scene, volume-boxes`).

- _Straight, as a designer draws_: the camera never rolls and stays upright (two-point
  perspective), so every vertical edge prints vertical; image planes, photos and pixel grids
  stand upright (`facing` turns a plane round the vertical only); tri-planes and boxes stay
  axis-aligned on one ground; rays and cone axes run level or gently rising into the scene. Never
  pass `upright: false`, an `up`, or a steep or upward look to make a scene "dynamic": it reads
  crooked.
- _Pick a view, not angles_: `view: 'three-quarter'` (the default, 35° round and a little above),
  `'side'` (depth runs left to right: rays and cones receding; mip-cone's default, turned toward
  three-quarter in a tall panel), `'front'` (front faces square-on: a
  rig round an object), `'top-oblique'` (a cabinet oblique from above where every copy looks the
  same: Swin and feature-map stacks, tri-planes, a row of volume boxes; the templates' default for
  those). Free `azimuth`/`elevation` snap to 5° steps and the elevation to 0–40° (a kit note
  says so). Use **front** (`camera: 'front'`, flat) when the paper's figure is 2D (Instant-NGP's
  grid) or depth adds nothing; a pipeline of boxes stays flat, only its 3D parts become scenes.
- _One view per figure_: panels that compare (NeRF vs Mip-NeRF, (a) vs (b), Swin vs ViT) go in one
  `fig.perspectives` row or share with `like: '<first scene>'`: one camera, one scale and one
  baseline, so the camera glyphs, planes and o of every panel line up. Size each scene's box to
  the scene so it fills about 70–85% of it (a long cone or row of boxes: a wide, short box).
  Azimuth runs round the scene seen from above: 0 looks from the right, -90 from the viewer's
  side, 90 from behind; a NeRF pose sits 35–60° to one side of the viewer (defaults -140, -55).
- _Photos on planes_: put the paper's own pictures on the planes (`photo: 'data/…png'`, `crop`
  to the subject, `opacity` 0.4–0.6 for a scene photo floating in a box); they are mapped in true
  perspective. Make each photo plane at least 0.6 in across at print, or show the picture flat
  beside the scene.
- _Templates first_ (`figures kit examples` has one whole script each): they print well with only
  the photos given, in a panel 200–330 units wide. `nerf-rays` (two posed image planes, rays through
  different pixels crossing in a dotted scene box, samples kept in front of the scene photo;
  `sampleStyle: 'open'`, `sampleRoles` or `sampleColors: ['#hex', …]` for the colour + density
  panel), `mip-cone` (`mode: 'ray' | 'cone' | 'gaussians'`, one per scene; `labels: true` names o,
  d, x, ṙ, t0, t1; every mode keeps one size), `triplane` (three feature
  planes, a query point projected; `labels: { xy, xz, yz }`, `point: false`), `camera-rig`
  (cameras with view cones around the object photo, `cam1.label` anchors), `swin` (`vit: true`
  for the baseline; anchors `level1.right` … as a custom `b.patchGrid` has), `hash-grid` (`dims:
  2` takes `point: [x, y]` and turns the camera to the front; `numbers` names the vertices),
  `volume-boxes` (glass boxes holding pictures or a density, a sun, a camera rendering the last).
  `figures kit perspective` lists every option and anchor. Adjust with `options`; draw
  your own with `draw: (b) => …` (`b.plane`, `b.ray`, `b.camera`, `b.cone`, `b.gaussian`, `b.box`,
  `b.voxels`, `b.triplane`, `b.patchGrid`, `b.stack`, `b.floor`, `b.path`, `b.point`).
- _Several panels of one scene_ (a ray, a cone, Gaussians): `fig.perspectives({ x, y, w, h,
  scenes: [{ id, template, options, labels }, …], arrows })` fits one camera and one scale to all
  and lays them out in a row (or give each scene its own `x, y, w, h`); `like: '<first>'` still
  shares a drawn scene's camera. **A two-stage story is two scenes and an arrow**: Mip-NeRF's
  cone with its t0–t1 frustum, then `arrows: [{ from: 'cone', to: 'gauss', label:
  '$\\mathcal{N}$' }]` to the Gaussians along it (`figures kit examples ray-cone`), never the
  Gaussians drawn inside the cone. Name a part with a short `fig.curve` pointer from its anchor,
  never a long right-angle bracket across the panel.
- _Looks, by default_: the house light from the upper left, soft fills under ink edges (look
  `'line'`), meshes in two tones with outlines, planes turned from the light a little darker, and
  on a `b.floor` every solid's cast and contact shadow. `fig.perspective({ look: 'flat' })`,
  `b.look({ planes: false })` and `b.floor({ shadows: false })` turn them off.
- _Labels_: anchors are page points; aim math, text and arrows at `scene.anchors['ray1.s4']` or
  `scene.point([x, y, z])`, or pass `labels: [{ at, tex, side }]` (`side: 'outside'` pushes a
  label away from the scene's centre); curved arrows (`fig.curve`) from a sample to the network
  and back read as in NeRF. Never put text inside the scene. Photo paths (`src`) are relative to
  the project folder (`data/<figure>/x.png`), not to the script.
- `figures check` warns when a perspective scene has fewer than two depth cues (add a dotted box, a
  floor, a lit solid, overlapping planes), a photo plane prints under 0.6 in, two panels use
  different cameras, rays run parallel where a pinhole makes them meet, a vertical edge prints
  more than 2° off vertical (`perspective-tilted-verticals`, `perspective-rolled-plane`), or a
  scene covers under half of its box (`perspective-small-scene`).

### Data figures

Plot when the figure shows numbers, samples or shapes of data: results from Runs, distributions,
sample paths, fields, surfaces. Draw a diagram when it shows modules and how data flows. A plot is
a Python script, `<figures>/src/<slug>.plot.py`, that draws with `aster_plot.py` beside it (numpy
and matplotlib, scipy optional; `figures plot new` and `run` write it). It takes the diagrams'
presets and accents, the paper look's LaTeX face (`ap.use(world)` sets it by default, as the
diagrams do; `look="preset"` keeps the sans) and page widths, and `p.save()` checks the figure and writes
`<slug>.pdf` (vector, page-true), `.svg`, `.embed.svg`, a `.png` preview and `<slug>.plot.json`;
never write those yourself, never `plt.savefig`, never `bbox_inches="tight"`. Plots appear on the
Figures page with their script, and `figures publish` copies a plot's PDF like a diagram's.

```bash
node H/cli.mjs figures plot kit [radar,toy.sinkhorn,3d]   # aster_plot's functions (= figures kit data), or only those
node H/cli.mjs figures plot new --name "Flow paths" --kind trajectories [--size single|double|WxH[in|pt|cm|mm|u]] [--venue icml] [--style graphite --accent blue]
node H/cli.mjs figures plot run --figure <slug>    # finds a Python with numpy and matplotlib (here or on the SSH host)
node H/cli.mjs figures plot check [--figure <slug>]   # the checks at print size; ERRORs must go
node H/cli.mjs figures plot preview --figure <slug>   # PNG, print-size PNG, findings boxed in red
```

Start from the kind closest to the request: each is a finished, checked demo on seeded toy data
(trajectories, teaser, sampling, landscape, field, density, distributions, surface, manifold,
fourd, snapshots3d, trajectories3d, slices, embedding, bars, curves, heat, radar, results, runs,
blank); keep its layout and style, swap in the
project's data, and say in your reply when toy data still stands in. Before plotting, write two
lines in the chat: the one comparison a reader must see, and where the data comes from.

<!-- prettier-ignore -->
```python
import aster_plot as ap
p = ap.panels("ab;cc", size="double", height=2.4, kinds={"c": "3d"}, sharey=["ab"],
              titles={"a": "ODE", "b": "SDE", "c": "Loss surface"}, legend="bottom")
ap.paths(p["a"], ode_paths)   # (n, steps, 2): thin paths fading toward the end, start and end dots
ap.surface(p["c"], X, Y, Z, path=run, f=loss)
p.legend()                    # one legend for the figure, in its own cell
p.save()
```

- **Many plots in one figure** are one `ap.panels` layout, never separate images side by side:
  `"abc"`, `"ab;cc"` (c spans), `(rows, cols)`; `width_ratios`, `kinds` (`3d`, `polar`, `joint`,
  `legend`, `off`), `sharex` / `sharey` (`True`, `"row"`, `"col"`, `["ab"]`; inner tick labels
  hide), `labels="(a)"` with `titles`, `label_loc="bottom"` for subcaptions, `legend="bottom"`,
  `"top"` or `"right"` then `p.legend()` (the cell fits the legend, columns fit the width;
  without a cell it goes above the panels), `p.xlabel` / `p.ylabel` for one label under several
  panels, and `p.inset(key, xlim=…, ylim=…)` for a zoom. `ap.legend(ax)` takes a corner clear of
  the data; a line over a band gets a line-over-fill entry (`ap.handle(kind="band")` by hand).
- **Toy maths** instead of your own (seeded, exact; `figures plot kit toy`): `ap.toy.mix` mixtures
  and `ap.toy.flow(dst, source=src, schedule="linear"|"trig", gamma=, coupling=)` with their exact
  `bridge_velocity` / `bridge_score` / `bridge_density`; `ap.toy.couple(x0, x1, "ot"|"minibatch"|
  "sinkhorn"|"independent")`, `assignment`, `sinkhorn`, `pair_flow` (what CFM learns from pairs);
  `ap.toy.sample(data, "ode"|"sde"|"ddim"|"ddpm", process="vp"|"ve", label=, guidance=)`;
  `ap.toy.integrate` (RK4) and `euler_maruyama`; `ap.toy.fn("rosenbrock"|…|"sharp-flat")` with
  exact `grad` / `hess`, and `ap.toy.optimize(fn, start, "sgd"|"momentum"|"adam"|"sign"|"lion"|
  "newton"|"diag-newton"|"sophia", cautious=)`. `ap.band` draws a conditional path mean ± k sd.
- **Trajectories and flows:** `ap.paths` for many samples over the target density in light gray
  (`ap.density(ax, data, color=ap.color("muted"), lines=False)`); `ap.path` for one path that
  matters (`arrows=`, `cmap_="seq"` to colour by time). ODE vs SDE, or straight vs curved, take the
  same samples and limits side by side (`sharex=True, sharey=True`). `ap.toy.flow(means, std,
  kind="ode"|"straight"|"sde")` gives exact paths for a toy mixture.
- **Generation teasers:** `ap.flow_strip` (2D snapshots along t joined by sample paths, gray noise
  turning into the accent) or `ap.sampling_1d` (paths over t with density profiles at the
  snapshots, "noise" and "data" at the ends).
- **Fields:** `ap.field` as equal-length arrows (direction) or streamlines toned by speed; mark
  the modes or fixed points. Landscapes: `ap.landscape` (light gray, low is darker) with the
  optimisers' `ap.path`s, ours in the accent.
- **2D densities:** `ap.density` draws highest-density contours (the regions holding 50/80/95% of
  the mass), fills darker inward; compare the data (gray, filled) with a model (accent, outlined).
  `ap.mixture` for fitted Gaussians, `ap.joint` (a `joint` cell) for marginals.
- **1D distributions:** `ap.densities`, `ap.hist` (shared bins), `ap.violin`, `ap.box` (points
  beside), `ap.ecdf`, `ap.ridgeline` (one per step or class, an accent ramp, labels at the left).
- **3D** only when the third dimension is the point: `ap.surface(ax, X, Y, Z, paths={name: run},
  f=f, ours="Ours", contours=10)` (lit light-gray faces, rasterized; paths, level lines and wire
  are dashed or left out where the surface hides them), then `ap.view3d(ax)` to pick the view
  that shows the paths, `ap.label3d(ax, xyz, "start", marker=…)` for points; a top view beside it
  when the route matters; `ap.cloud`, `ap.swiss_roll_surface`, `ap.sphere(geodesics=…)`. 3D cells
  come clean (`ap.clean3d(labels=…)`: no panes, grid or ticks, names along the front edges).
- **4D** (a fourth variable, or 3D over time): `ap.cloud4d` / `ap.surface4d` colour 3D points or a
  surface by the fourth variable (`size_by=` adds a fifth as marker area) with a compact colour
  bar (`ap.colorbar(mappable, ax, label=…)`: thin, three ticks, 7 pt, always labelled); a
  perceptual map (viridis, cividis, `ap.cmap("seq")`), never the accent ramp for a measured
  quantity. Over time: `ap.snapshots3d` (one 3D cell per t in one shared box, view and limits,
  "t = …" above each), `ap.trajectories3d` (paths coloured by time with a time bar) and
  `ap.trails` (moving points with a fading recent past, 2D or 3D). A field over space and time:
  `ap.slices` (rows of z-slices × columns of t on one colour scale, one bar, rows and columns
  named on the outer cells). High-dimensional data: `ap.embedding` (PCA here, or your t-SNE/UMAP
  coordinates; by class, or by time with a bar; axes named "PC1 (41%)") and `ap.parallel`
  (parallel coordinates, `log=` for rates, the best runs drawn on top).
- **Results:** `ap.bars` (ours in the accent, baselines gray with hatches and black edges, error
  bars, value labels, `best=`, `hatches=` a list or dict, `stars=[(group, a, b, p)]` for
  significance brackets: * p < 0.05, ** < 0.01, *** < 0.001, the test named in the caption),
  `ap.curves` (mean ± std over seeds, ours drawn last), `ap.heat_table` (shaded per column, the
  best in bold), `ap.radar` (a `polar` cell, ring values printed, `reference=` for a human level),
  `ap.dots` (ablations against a reference). Runs: `ap.load_runs(ap.here({name: [metrics.jsonl, …]}), metric, split="val")`.

**In a diagram.** A plot that sits in a diagram's cell (a teaser mixing a schematic and data) is
made at that cell's size with `panel=True` (`figures plot new --size 312x216u` does it, or
`ap.figure(size=(w / 144, h / 144), panel=True)`; `labels=None` when the diagram labels the
cells), so the page-width check stays quiet; `p.place(key, (x, y, w, h))` puts a panel at an exact
rectangle in scene units, and cells too small for their labels are laid out by hand rather than
collapsing. The manifest gives each panel's limits for `fig.plotPoint` and the smallest font
(`text.minPt`); dense layers become images only in the embedded SVG, listed under `raster`.
`figures plot run` updates every diagram that embeds the plot.

**Check the plot like a diagram.** After every edit run `figures plot run`, `figures plot check`
and `figures plot preview`, open the PNG, the print-size PNG and the lint PNG, and fix, at most
three rounds. Before you finish:

- the page is a column width (3.25 or 6.75 in, or the venue's) and a double-column plot stays
  2.8 in tall or less unless the person sized it;
- no ERROR from `figures plot check`; each warning fixed or explained in your reply
  (`hidden-text` / `hidden-curve`: something sits under a fill or a thicker line);
- text 7–9 pt in the print-size PNG, nothing overlapping, the legend off the data (above, in a
  legend cell, or `ap.label_lines` at the line ends);
- ours in the accent (a world's `a`) and nothing else in it; in a world the one compared
  baseline in the given hue (`d`), other baselines gray; four hues at most; `good` and `bad` only for right and wrong; perceptual colour maps (`ap.cmap`,
  viridis, cividis), never jet or rainbow;
- axes labelled with units, 3–6 ticks each, no title (the caption says it), 3D without panes;
- the data itself (densities, samples, paths), not a box naming it; one point per figure, and a
  proposed caption in your reply.

## Writing

When the person asks you to write or revise paper text (Aster's Writing page and its Writing
agent), follow this section. Model-written papers no longer give themselves away by their words;
they give themselves away by their reasoning. In 24 naive drafts written from code or notes, 20 had
no citations and 20 no figure or table reference; 15 ordered the method like the code; 14 buried
or lost the key insight; every method missed the derivation or analysis the paper was about; 12
had steps without a reason, undefined notation, or no alternative considered; 8 invented citation
keys or credited the person's method to a published paper. The 18 published papers they were
measured against argue: they cite, point at evidence, say why the obvious fix fails, and hedge
causes while stating measurements flatly. Write like them.

Inside a full manuscript (its bibliography, labels and other sections in reach) those failures
mostly vanish, and others take their place. In 40 drafts written into real papers, judges most
often flagged claims beyond the evidence, padding (results paragraphs ran 1.8 times and abstracts
1.4 times the published length), details found in no input, bold run-in labels and lists, and
sentences copied from the famous paper being rewritten. Weight your work toward ground rules 2, 3,
7 and 8 below as much as toward structure. A model judge that prefers your longer, more explicit
text is not evidence that it is better.

Over-caution loses too. In 20 drafts written with this guide, copying, lists and padding vanished,
yet judges preferred them less than unguided drafts and rejected every abstract: the agent left 34
`\todo`s for numbers that sat in the manuscript's own tables or `data/` (no claim existed yet), so
judges called the text "missing key content" and "too thin"; methods reported ablation results that
belong to the experiments. Numbers already in the manuscript or the project's data are sources
("Citations and numbers"); results stay in the experiments (ground rule 9).

```bash
node H/cli.mjs writing check --file <tex> [--section intro|method|experiments|abstract|related]  # lint; exit 1 on errors
node H/cli.mjs writing outline --file <tex> [--section S]          # each paragraph: guessed role, first and last sentence
node H/cli.mjs writing skeleton get|set|confirm --section S [--file -]  # the 5-line skeleton; confirm is the person's
node H/cli.mjs writing context --code <path> [--code <path>]...    # modules, core candidates, details and flags to omit
node H/cli.mjs writing bib                                         # every citation key you may use, with titles
node H/cli.mjs claim list | claim add ... | claim scan             # numbers (see "Every number in the paper gets a claim")
```

### Ground rules

1. **Argue, do not describe.** Every paragraph has one job. Its first sentence states the point;
   the rest supports it with a number, a pointer (`\ref`), a citation or a mechanism. It ends on
   content or a bridge to the next paragraph, never on a sentence that restates it.
2. **Never invent; ground every fact.** Every fact you write traces to a source you can name: the
   code, a Run or claim, the person's notes, the manuscript, a data file in the project, or a cited
   paper. Numbers come from the sources in "Citations and numbers", citations from the project's
   bibliography, motivation from the person. Add no detail, comparison, dataset or motivation that
   none of them contains. Never reproduce wording from a published paper you recognise, including
   the one you may be rewriting; write from the inputs. A fact you take from another part of the
   manuscript (a number, a task count, a baseline, an ablation outcome) stays identical to it (value,
   rounding, name, scope) and points to where it comes from: `\cref{tab:main}`,
   `\cref{sec:ablation}`, or in the abstract a comment (`% source: tab:main`). A reader who has
   not seen that section must be able to find it. A placeholder is for what no source holds: search
   the manuscript (tables, captions, the experiments, the appendix) and the project's data first.
   Then leave a visible placeholder and list it in your hand-off: `\cite{TODO:what-it-must-show}`,
   `\todo{evidence: what is needed}`, `\todo{Figure: what it must show}`.
3. **The method is the person's.** Never credit it, or a part of it, to a published paper because
   you recognise the code or the idea ("follows X et al.", "built on the framework of ..."). In the
   naive trials Claude did this in 3 of 6 method drafts, which erases the paper's novelty. Credit
   prior work only where the person says a part is borrowed or the `.bib` they chose holds it, and
   then credit it precisely (what was taken, what is new).
4. **Confirm the skeleton before drafting** an introduction, abstract, method or experiments
   section (next part). Do not draft from an unconfirmed skeleton.
5. **Check after every draft** with `writing check`, fix the errors and the warnings you agree with,
   then score the self-critique rubric below. At most two revise rounds; report what remains.
6. **Keep the person's voice.** When editing their text, change the minimum, keep every number,
   citation and label unless asked, and say what moved and why.
7. **Claim only what the evidence shows.** Say what was measured, on what, against what. Give counts
   instead of sweeps ("on 14 of 16 subtasks", not "on every task"; "all three baselines" only when
   it is three); scope superlatives, "up to" and "consistently"; tie each claimed benefit to the
   table or figure that tests it; hedge causes ("we attribute", "this suggests"); keep take-aways at
   the level of the evidence, not the field.
8. **Fit the slot.** Before drafting, set a length budget and keep to it: the text you replace
   (within 15%), else the sibling sections and the venue's page limit, else the published sizes:
   abstract about 170 words (150-230) in one paragraph; introduction about 570 words (370-830) in 4-8
   paragraphs; method paragraphs about 90 words; results paragraphs 60-100 words. Put it in the
   skeleton as `BUDGET:`. Padding goes first: restating and announcing sentences, explanations of
   what the reader just read, a sentence per obvious step. Write paper prose, not notes: no bold
   run-in label on every paragraph (keep `\paragraph{}` run-ins for named design decisions or
   related-work families, where the paper already uses them), no bullet lists for arguments or
   results, no markdown.
9. **Keep results in the experiments.** The method says what the approach does and why it should
   work; it reports no measured outcome (an accuracy, "removing X degrades", "0.9 was best", "in our
   experiments"). Where an experiment tests a design choice, give the reason and point forward ("we
   ablate this choice in \cref{sec:ablation}"). The introduction carries 2-3 headline numbers with
   scope, not the per-dataset breakdowns, baseline-by-baseline comparisons or ablation details the
   experiments hold. `writing check` flags results in the method (WS-METHOD-RESULT).

### The 5-line skeleton

Before drafting, write or receive five lines and get the person's confirmation:

```
GAP:      who fails at what, and the evidence that shows it (number, figure, citation, construction)
WHY-NOT:  the obvious fix, what it does solve, and the mechanism by which it still fails
INSIGHT:  one sentence: the finding, hypothesis, reframing or principle that explains the gap
APPROACH: what we do, stated as a consequence of the insight, in one sentence
EVIDENCE: 2-3 headline results with numbers and scope, each with a claim id or a table/figure
```

Optional lines: `BUDGET` (words and paragraphs for the slot, from ground rule 8), `CONTEXT` (the
field, one line), `LOSES` (where the method loses or costs more, and
why), `TERM` (the coined name, reused verbatim everywhere), `VARIANT` (classic gap, diagnostic
question, observation-led, reframing or method-forward), `CONTRIBUTIONS` (2-4 verifiable items),
`ORDER` (the method's subsections, by idea), `OMIT` (code detail left out), `QUESTIONS` (what the
experiments answer). Example, compressed from StreamingLLM:

```
GAP:      LLMs cannot stream: the KV cache grows without bound and perplexity explodes past the training length (Fig. 1).
WHY-NOT:  Window attention bounds memory but collapses as soon as the first tokens are evicted (Fig. 3).
INSIGHT:  Models dump attention on the first tokens regardless of meaning, because softmax must sum to one and initial tokens are visible to all.
APPROACH: Keep the KV of 4 initial tokens plus a rolling window; assign positions within the cache; no fine-tuning.
EVIDENCE: Stable perplexity to 4M tokens on 4 model families (claim c3); 22.2x faster than sliding-window recomputation (claim c5).
TERM:     attention sink
```

Save it with `writing skeleton set --section <s> --file -` (the lines, then free notes: the
paragraph plan with each paragraph's role, evidence, citations and figure; the Figure 1 plan; open
questions; each EVIDENCE item resolved to a claim, a table, caption or section of the manuscript,
or a data file, else marked MISSING). Show it in the chat and stop.
The person edits and confirms it on the skeleton card of Aster's Writing page, and Aster sends you
a message when they do; `writing skeleton confirm` is refused in agent sessions. If they answer in
the chat instead ("confirmed", "just write it"), go ahead and keep MISSING items as placeholders.
Five lines the person wrote themselves (in the request or in their notes) are already their
decision: save them with `skeleton set`, then draft. Any later change to the lines makes the
skeleton a draft again.

### What strong papers do (and the lint checks)

- **Show the gap** with a number, a figure, a construction or a cited failure; never assert it.
- **Credit prior work, then criticise its mechanism**: what it solves, then what in it causes the
  failure, with a measurement if one exists. Every criticised family gets a citation. Adjectives
  ("suboptimal", "limited", "struggles") are not criticism.
- **State the insight before the method's name**, in one sentence; the method follows from it
  ("Based on this analysis, we introduce ..."). Each claimed advantage names the prior mechanism it
  removes.
- **Order the method by idea, never by code**: problem setup in the baseline's notation, then what
  changes; or the objective's terms; or a derivation chain (obstacle, then the trick that removes
  it); or named design decisions. Intuition before formalism; after each key equation, a sentence
  on what it does.
- **Every design choice gets a reason and "why not the obvious alternative"**: purpose clause,
  choice, counterfactual ("Using X instead would ... because ..."), pointer to the ablation. Frame a
  knob by its two failure modes.
- **Leave out or send to the appendix about 30% of what the code does**: flags, modes, padding,
  dtype, devices, distributed code, logging, clamps, initialisers, defaults that are not design
  decisions. No identifiers, flags or file names in prose; name the operation in words or math.
  Commit to one code path: a studied variant is an ablation, an option is not method prose.
- **Every claim gets a number or a pointer** (number, `\ref`, `\cite`) in the same or the next
  sentence. Scope every superlative and aggregate ("among methods that use only ImageNet-1K", "on 15
  tasks from 4 benchmarks", "up to 22.2x over sliding-window recomputation"). No unbounded words
  (always, never, any, guarantees) without a proof or the tested range.
- **State measurements flatly; hedge causes** ("we hypothesize", "this suggests", "we attribute").
  Published introductions carry 1-7 hedges per 1,000 words; naive drafts carry none.
- **Reference figures and tables**: plan the teaser figure with the gap paragraph; every float is
  referenced and interpreted (in prose or in a caption that states the takeaway).
- **Define every symbol where it first appears** ("Let ... denote", a `where` clause after a
  display equation); one symbol per meaning. Write the baseline in the same notation.
- **Present tense and "we"** for the method and its claims (published methods use "we" 15-32 times
  per 1,000 words; naive ones 1-15); past tense only for completed procedures.
- Vary sentence length; keep one short sentence for the key claim. Single-sentence paragraphs,
  restating last sentences, "In summary, our contributions are" lists that repeat the paragraphs
  above, and template phrases ("In this paper, we propose a novel") read as generated.

### Citations and numbers

- Cite only keys `writing bib` lists. Never write a key you have not seen there, not even a likely
  one ("vaswani2017attention"). When a source is needed but unknown, write
  `\cite{TODO:what-it-must-show}`; the lint lists every placeholder. Introductions cite about 1.8
  times per 100 words, related work about 4.5.
- Take each result number from the first of these that has it, and never write one that none has:
  1. a recorded claim tied to a Run (`claim list`);
  2. the manuscript itself: a table, a figure caption, or another section's text;
  3. a data file in the project (`data/`, a results CSV, JSON or Markdown table).

  Copy it as printed there: same value and rounding, same condition (model, dataset, setting). Use
  (2) and (3) directly. Name the source in a LaTeX comment in the paragraph (`% source: tab:main,
  LLaMA-7B row` or `% source: data/results.csv`) and, outside the abstract, point the reader to the
  table or figure (`\cref{tab:main}`). In the hand-off, suggest recording them as claims once a Run
  backs them, but never hold a number back for want of a claim. Write `\todo{evidence: ...}` only
  when none of the three has it; `writing check` flags a `\todo` whose number it finds in the
  manuscript or the data (WC-TODO-SOURCE) and says where.

- A number you take from a Run goes through `claim add` right after you write it, and `claim scan`
  before you hand off (see "Every number in the paper gets a claim"). A configuration value that
  is not a result can be waived on its line: `% writing-check: allow WC-NUMBER batch size, not a
  result`.

### Workflow: code → method

1. `writing context --code <the folders>`; read the code. In the chat, write the code manifest: code
   symbol, what it does, class (core idea, design choice, invariant that makes a claim true,
   analysis, engineering, config), destination (main text, appendix, omit) and its paper name. Expect
   about 30% in the appendix or nowhere. Note the commit you read.
2. Ask in one message for what code cannot show (skip what you know): why the naive version or the
   obvious baseline fails and what shows it; which alternatives were tried or ruled out; which detail
   looks minor but is essential; whether the method is derived from an objective (the baseline
   objective and the key step); which numeric values are design decisions and which ablation supports
   them; **which parts are the person's and which are borrowed, from where**; which code paths are
   the method and which are options or dead branches.
3. Write the method skeleton (GAP, WHY-NOT, INSIGHT, APPROACH, EVIDENCE, and ORDER: the subsections by
   idea) and stop for confirmation.
4. Draft each subsection: intuition (what it does and why it is needed), formalism with a `where`
   clause and a behavioural reading, design choices with reasons and counterfactuals, then a short
   implementation paragraph with only what a claim depends on. Before leaving a question open, look
   for its answer in the manuscript: the experiments, ablations and appendix often say why a choice
   was made. If an experiment tests the choice, give the reason and point to it (`\cref{sec:ablation}`)
   without reporting its numbers (ground rule 9). Only what no source answers becomes a `\todo{}`,
   never invented text. Plan one overview figure or algorithm box when there are more than three
   steps.
5. `writing check --section method`; fix; self-critique.

### Workflow: skeleton → introduction

Confirm the skeleton, then write paragraph by paragraph from its plan (4-8 paragraphs, about 570
words): context with specific, cited facts (no "In recent years"); the gap with its evidence and the
teaser figure; why the obvious fixes fail, credited and criticised by mechanism, each with a
citation; the insight in one sentence before the method's name; the approach as its consequence;
2-3 headline numbers with scope, from claims or the manuscript's tables and pointed to; where it
loses, if LOSES is set. Name each baseline you will compare against. Take from the other sections
only the facts the paragraph's argument needs, identical to them and pointed to; leave their
breakdowns there. If it is not obvious why the approach answers the gap, give one intuition
example. Check that every challenge raised is answered later; cut any you cannot answer.
Contributions: 2-4 verifiable items with pointers, or none; never a restatement of the paragraphs
above, a result or a section map. `writing check --section intro`; fix; self-critique.

### Workflow: Runs and claims → experiments

1. Read `context`, `claim list` and the Runs (`run show`), and the tables and data files (`data/`)
   the results come from. List the questions the experiments answer:
   one per introduction claim and contribution, plus one per design choice the method says is
   validated. Show the list; put it in the skeleton's QUESTIONS line and confirm.
2. Setup: datasets, baselines (generous ones, and why each is fair), metrics (justified before the
   results), one declared default setting; details to the appendix.
3. One subsection per question, its heading the question or the finding. Each result: purpose clause,
   "Table X shows ...", the takeaway with the delta and its scope, a hedged mechanism, the experiment
   that tests it if there is one. If the introduction claims a phenomenon, show it on the baseline
   first.
4. Ablations say what is held fixed and end with the decision ("so we use ... in all other
   experiments"). Discuss where the method loses or ties, with the cause. Captions state the takeaway.
5. Every number from a Run through `claim add`; every number from a table or data file with its
   `% source:` comment; `writing check --section experiments`; self-critique.

### Workflow: abstract

Write it last, from the confirmed skeleton and the body: one paragraph, 5-9 sentences, about 170
words (150-230), one role per sentence. Gap-first (context, problem, prior limits, insight, approach,
result, comparison) for most papers; approach-first when the method's name carries the gap;
result-first when the gap is "nobody has shown X works". Insight before the name.

- **Coverage before depth.** Give every contribution the introduction lists a clause or a sentence
  (a second application, a generalisation result, a variant, an analysis) before spending words on
  mechanism. The method gets its one insight in plain words: no estimator names, loss terms,
  hyperparameters or critique of a baseline's derivation.
- **One to three headline numbers**, each with its condition, from claims or the body's tables (the
  source in a `% source:` comment). Do not stack more.
- **No placeholder.** An abstract never holds a `\todo`. When the body has no number for a finding,
  state the finding concretely without one ("outperforms reward-weighted regression on all three
  rewards") and list the missing number in your hand-off.
- **At the strength the body shows**: no stronger ("avoids both problems") and no vaguer ("also
  changes samples" for a measured improvement). No expectation or mechanism the body does not test.
- No `\ref`, `\cref` or `\cite`, no undefined acronyms or symbols, no "paves the way". Every
  abstract claim must appear in the body.

### Workflow: related work

Group prior work into 3-6 families by mechanism, not chronology, with a run-in heading each
(`\paragraph{Masked image encoding.}`). Each paragraph: what the family does (cited), what it
achieves, its limiting assumption or mechanism, and how this paper relates. No list of citations
without a verb; no new claims the paper does not test; reuse the introduction's terms.

### Workflow: tightening a selection

Edit only the selected passage. Run `writing check` on its file and list the findings in it. Write
each paragraph's job in five words; split or merge paragraphs that have none or two. Delete restating
last sentences and announcements; replace adjectives and boosters with the number or the evidence;
scope superlatives; hedge mechanisms and un-hedge measurements; replace code names with symbols or
plain operations; split sentences over 60 words. Use active voice and "we". Aim 10-20% shorter
without losing a claim, number, citation or label, and report what was cut and what needs the
person's evidence.

### Self-critique and hand-off

After `writing check`, score each item 0 (fails), 1 (partly) or 2 (passes) with a verbatim quote as
evidence. Fix every 0, revise at most twice, and report the remaining 1s.

| #   | Question                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | Is there one sentence that states the gap, and does it carry evidence?                                            |
| 2   | Is each criticised prior approach credited, then criticised by mechanism, with a citation?                        |
| 3   | Is the insight one sentence, before the method's name, and does it explain the gap?                               |
| 4   | Does every claim have a number, a reference or a citation nearby, and does every number name its source?          |
| 5   | Are superlatives and aggregates scoped, and unbounded words justified?                                            |
| 6   | Does every paragraph have one job, stated in its first sentence, and end on content?                              |
| 7   | Method: ordered by idea; every step has a reason; main choices have a counterfactual; no measured results?        |
| 8   | Method: no code identifiers, flags or defaults in prose; engineering detail in the appendix?                      |
| 9   | Is every symbol defined at first use, with one meaning?                                                           |
| 10  | Are mechanisms hedged and measurements stated flatly?                                                             |
| 11  | Is every introduction claim paid off in the experiments, and every float interpreted?                             |
| 12  | Did I invent anything? Can I name each fact's source; is a fact from another section identical, pointed to?       |
| 13  | Is the method credited to the person, and only borrowed parts to their sources?                                   |
| 14  | Is the coined term used identically everywhere?                                                                   |
| 15  | Quote the three most generic sentences (they could be in any paper) and rewrite them with this paper's specifics. |
| 16  | Is the text within its length budget, with no run-in label on every paragraph, no list and no markdown?           |

Hand-off, briefly: the skeleton and variant used; the length against its budget; the facts you
added beyond the person's text, each with its source; numbers taken from the manuscript or data
without a claim, as claims to record; open placeholders (citations, evidence, figures) as a
checklist; `writing check` counts before and after; the rubric's top remaining issues; anything
in the code that contradicts the paper.

## Rules

- Never execute training or evaluation merely to populate records.
- Never hand-edit `run.json`, `metrics.jsonl`, `media.jsonl`, `summary.json`, `project.json`, or `claims.json`; use the CLI.
- When results already exist elsewhere and the mapping is ambiguous, report the candidate Experiment and Run with source paths. Do not guess an execution state, dataset revision, metric unit, or launch commit.
- Run `validate` after changing the catalog and repair only issues your changes caused. Aster imports valid catalog Experiments and Runs automatically.
- Do not delete files, move code, switch Git branches, push, or copy large artifacts as part of tracking. If the project has no catalog, run `init` only when the user is beginning research work in that project; it creates `.aster/` and, unless you pass `--manuscript` for an existing paper, `paper/main.tex`.
