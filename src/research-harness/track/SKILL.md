---
name: aster-research-track
description: Keep an Aster research project's Experiments, Runs, analyses, and paper numbers traceable while doing research work in an agent conversation. Use when the user starts, launches, evaluates, compares, analyzes, or reports on a concrete experiment, when Aster starts you as an Experiment's research agent or hands you an approved proposal to implement, or when you write a result number into the manuscript, in a project with .aster/project.json (or an older research/project.json). Do not use for ordinary coding chat or one-time migration of an existing project.
---

# Track research work in Aster

The conversation is where the user directs the work. `.aster/` holds the records Aster reads to show Experiments and Runs (each Run is a folder under `.aster/experiments/<slug>/runs/`); `.aster/claims.json` ties paper numbers to Runs. Projects set up before `.aster/` keep the same files under `research/`. Maintain both as a consequence of real research work, through the harness CLI only.

If the user asks you to check an Experiment question with another agent, stay in this chat:
use `aster agent list --json` to find the relevant open chat, follow the
`aster-orchestration` consultation guide to ask it, and bring its sourced reply back here.
Do not make the user choose a session or create another agent merely for the question.

Run `aster research harness-path` on the machine that holds the project; it prints the
version-matched absolute path to `cli.mjs`. `H` below means the parent of that path. An
installed skill's parent is not necessarily the harness. In a source checkout without the Aster
CLI, the parent of this **resolved** skill directory contains `cli.mjs`. Run it from anywhere
inside the project: `--project` defaults to the nearest ancestor containing
`.aster/project.json` (or an older `research/project.json`). Add `--json` for one
machine-readable object (`{"ok":true,...}`, or `{"ok":false,"error":{"code","message"}}`
with exit 1). `node H/cli.mjs --help` lists every command.

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

It creates the Run, records git HEAD, dirty flag and `code.patch`, host, argv, and your agent identity, tees output to `train.log`, records metric lines in `metrics.jsonl`, and writes the observed exit to `run.json`. Its exit code is the command's. Never launch an experiment without it when you start the process yourself.

- Make the script print metrics, one line per observation (stdout or stderr):

  ```python
  import json
  def log_metrics(step, split, **metrics):
      print("ASTER_METRIC " + json.dumps({"step": step, "split": split, "metrics": metrics}), flush=True)
  ```

- The command sees `ASTER_RUN_REF`, `ASTER_RUN_DIR`, and `ASTER_RUN_ARTIFACTS`; write outputs to the artifacts directory.
- Make the script announce each image, video, or audio sample it saves; the harness records it in the Run's `media.jsonl` for Aster's gallery (files must be inside the project; png jpg gif webp, mp4 mov webm, wav mp3 flac ogg and similar; anything else is refused with a notice):

  ```python
  import json, os
  def log_media(path, step=None, label=None, sample_id=None):
      print("ASTER_MEDIA " + json.dumps({"path": os.path.abspath(path), "step": step, "label": label, "sampleId": sample_id}), flush=True)
  ```

- Long runs: start it in the background and note the `[aster] started <experiment>/<run>` line on stderr. If `aster research --help` lists `watch`, sleep with `aster research watch --run <ref> --on exit --notify self` instead of polling. Otherwise check `run show <ref>` or `run list --state running` at sensible intervals.
- One Run is one execution attempt. Reruns and seeds get new Runs. Agent completion is not Run success; only the recorded exit is.

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

Leave out `--value`: the harness reads it from `metrics.jsonl` and refuses a `--value` that disagrees. If it refuses, fix the paper, not the claim. Add `--supporting` for evidence that backs a number without being printed, such as the baseline of a reported gain; add more evidence with `claim add-evidence --id <claim>`.

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

- **Design.** Write or update the brief with `brief set` (question, hypothesis, primary metric, baseline, seeds). Propose each Run you plan with `proposal add` and its exact `run exec --experiment <slug>` command. When the Run needs any code change, add `--needs-code` and put what to change and how to tell it is done in `--rationale`; never edit code yourself from this chat.
- **Run.** Launch a config-only Run with `run exec` once the user approves its proposal (or within the budget under `proposals: budgeted`), then record `proposal launched`.
- **Analyze.** Write analysis scripts and their outputs under the catalog root's `experiments/<slug>/analysis/` (png figures; csv, tsv, or json tables; md notes). Use `.aster/` for current projects and `research/` for legacy projects. Record each result you report:

  ```bash
  node H/cli.mjs analysis add --experiment <slug> --title "<what it shows>" \
    --file <record-root>/experiments/<slug>/analysis/<file> --summary "<one-paragraph takeaway: numbers, n, caveats>" \
    --run <slug>/<run> [--run <slug>/<run>]... [--supersedes <analysis-id>]
  ```

  Write only what the file shows. Pass `--supersedes` when a newer analysis replaces an older one. `context` lists the latest analyses; read them before redoing one.

- **Explain failures** from evidence: `run show <ref> --log-lines 50`, metrics, and config. Record the cause with `quality add` and propose the fix.
- The conclusion (`brief.conclusion`), finding decisions, and proposal decisions are the user's.

## Workbench handoff

When the user approves a `--needs-code` proposal and hands it to a Workbench coding chat from Aster, that chat receives the proposal. If you are that coding agent:

1. Read the proposal (`proposal list --experiment <slug>`) and `brief show --experiment <slug>`; implement the change it describes.
2. Launch with `run exec --experiment <slug>` and the proposal's command, changed only as the implementation requires, so the Run lands in the same Experiment with this code's provenance.
3. Record `proposal launched --id <proposal> --experiment <slug> --run <new ref>`.
4. Follow "When a Run ends", then report back: what you changed, the Run reference, and its result. Leave the analysis and conclusion to the Experiment chat.

Never run `proposal handoff`; only the user hands work over, in Aster.

## Rules

- Never execute training or evaluation merely to populate records.
- Never hand-edit `run.json`, `metrics.jsonl`, `media.jsonl`, `summary.json`, `project.json`, or `claims.json`; use the CLI.
- When results already exist elsewhere and the mapping is ambiguous, report the candidate Experiment and Run with source paths. Do not guess an execution state, dataset revision, metric unit, or launch commit.
- Run `validate` after changing the catalog and repair only issues your changes caused. Aster imports valid catalog Experiments and Runs automatically.
- Do not delete files, move code, switch Git branches, push, or copy large artifacts as part of tracking. If the project has no catalog, run `init` only when the user is beginning research work in that project; it creates `.aster/` and, unless you pass `--manuscript` for an existing paper, `paper/main.tex`.
