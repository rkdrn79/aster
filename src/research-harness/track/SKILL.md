---
name: aster-research-track
description: Keep an Aster research project's Experiments, Runs, analyses, and paper numbers traceable while doing research work in an agent conversation. Use when the user starts, launches, evaluates, compares, analyzes, or reports on a concrete experiment, when Aster starts you as an Experiment's research agent or hands you an approved proposal to implement, when you write a result number into the manuscript, when you answer paper reviews in a rebuttal (Aster's Rebuttal page and its Rebuttal agent), or when you draw or plot paper figures (Aster's Figures page and its Figure agent), in a project with .aster/project.json (or an older research/project.json). Do not use for ordinary coding chat or one-time migration of an existing project.
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

It creates the Run, records git HEAD, dirty flag and `code.patch`, host, argv, and your agent identity, tees output to `train.log`, records metric lines in `metrics.jsonl`, and writes the observed exit to `run.json`. Its exit code is the command's. Never launch an experiment without it when you start the process yourself.

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
in an older project); `figures new` puts them there. While the figure is open in Figures, Aster
reloads every change you save and writes `<slug>.svg`, the vector `<slug>.pdf` and a PNG preview of
exactly what the PDF shows; never write those yourself. Keep the drawing script at
`<figures>/src/<slug>.figure.mjs` and commit it with the figure, so the figure can be regenerated.
A plot is a matplotlib script in the same folder that saves its own `.pdf` and `.png`. An older
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
node H/cli.mjs figures kit [topic|name,…] # an index of the kit; a topic or names give options, defaults, bind targets
node H/cli.mjs figures kit colors          # the colour presets with their hex values and rules
node H/cli.mjs figures context [--manuscript <tex>] [--figure <slug>]  # sections and run-in headings of that manuscript
node H/cli.mjs figures run --figure <slug>  # runs the script (writes the portable aster-figures-kit.mjs shim beside it)
node H/cli.mjs figures list | figures show [--figure <slug>]     # page, style, script, elements
node H/cli.mjs figures new --name "Method overview" [--size single|double|WxH] [--style graphite]
node H/cli.mjs figures check [--figure <slug>] [--area <frame id>]  # layout lint; ERRORs must go
node H/cli.mjs figures preview [--figure <slug>] [--wait 90]       # waits for Aster's PNG, prints it
node H/cli.mjs figures publish --figure <slug> [--replace]          # only when the person asks: copies the PDF to the paper
```

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
or fill a box with `fit: { w, h }`; transformer has `variant: 'post-norm'`. Size cards, bubbles
and networks with `fig.measure` first, and fix any kit warning `figures run` prints. Use
`fig.ellipsis` for ⋯; point an arrow at a group with `to: [ids]` or `fig.group`; `fromAt: { y }`
leaves a tall box at one height. Let `loss()` place itself; if it throws, use the `cx, cy` it
suggests. Cut patches with `image({ patch, of })`; `image({ mask, prompt })` draws a
segmentation. For agent and reasoning figures, start from the `reflexion`, `prompting` or
`trajectory` template.

**Block diagram or illustration.** Method detail (one block, the training graph) is a block
diagram in a paper preset. An overview or teaser (what the method changes, compared with what
came before) is an illustration: `fig.style('illustrative', { panels: ['rose', 'teal'] })` gives
the rounded Nunito font and tinted rounded panels; draw the data (`bubble`, `nn` network glyphs,
photos), long plain arrows between stages, `cycle` for a loop, and the paper's one-line message as
a coloured `callout` on the flow ("maximum likelihood"). To
compare methods put them in side-by-side panels with the same data on both sides
(`panel({ same })` lines them up) so the difference is the only thing that changes (DPO vs RLHF).

**Loops and feedback.** When the method is a loop (an agent that acts, is evaluated and
reflects; a data engine; RLHF's sample, score, update), the loop is the hero: put its stages on
one ring or one row with a single return path, draw that path in `role: 'main'` (`cycle` or a
`curve` in an illustration) and name what flows back on it ("reflection", "reward"). What sits
outside the loop (the environment, a memory) stays beside it and joins with ordinary arrows.
Feedback inside a block (a recurrent state, a memory written and read back, a residual) stays
inside that block's panel: a short `skip` or a return elbow beside the forward path in the `side`
weight, never a long arrow around the figure. Keep back arrows few, each labelled.

**Figures beyond the method.** Pick the kind of figure first; each has its own spine. The
illustrative preset suits a pipeline, a motivation figure or a teaser; graphite or outline suits a
grid of examples.

- _Data pipeline or dataset construction_ (`pipeline`, `funnel`): source → processing → final
  dataset, left to right, one card per stage with its icon (`globe`, `language`, `filter`,
  `dedup`, `inspect`, `annotator`, `robot`, `database`), its rule as the note ("fastText en ≥
  0.65", "MinHash, 13-grams") and its count, so the shrinking shows ("5.8B → 2.1B → 140M").
  Show two or three real examples per stage: thumbnails, a text snippet, a duplicate crossed
  out at dedup. An annotator or a model in the loop is an icon on the stage it acts in. A data
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
- _Conceptual illustration_: `nn`, `bubble`, `cycle`, `callout`, long plain arrows.

Never emoji. A numbered procedure takes `step` digits or `pipeline({ numbered: true })`; a span
that shares a property takes a `brace` with its label.

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
- One colour scheme by role, no legend unless three or four roles need a key or the person asks
  (then `fig.legend`, small, above the panels): trained modules in the accent, frozen modules gray;
  `trainable(id)` and `frozen(id)` (a solid flame in the accent, a gray snowflake, drawn to read
  at 8 pt; never emoji unless asked) only when
  the figure mixes trained and frozen parts, then one badge per module. EMA copies are gray with
  no badge (they are not frozen); a module frozen in one stage and trained in another gets a note
  under the loss, not a badge. When everything trains, the accent marks only the contribution.
  Predictions tinted (`predicted: true`), targets gray.
- Weight follows the contribution: ordinary flow is the default `data` arrow (gray, 1 pt);
  `role: 'main'` (dark, 1.25 pt) is chosen on purpose for the paper's contribution path, not
  automatically the data or residual path (in DiT the conditioning is the contribution); `side`
  for side inputs (0.75 pt), `aux` for EMA and stop-grad (dashed).
- Arrows run only horizontally and vertically: straight where two shapes share a row or column,
  else one sharp elbow (two at most) that the kit routes around other boxes; never slanted
  (`allowDiagonal: true` only when the slant means something, `curve` for loops in
  illustrations). Residuals are `skip`, one-to-many `fork`, many-to-one `merge`; a junction's `at`
  is where its dot goes. Boxes sit on an 8-unit grid; rows and columns line up exactly and are
  evenly spaced; `measure` sizes things before you place them.
- Groups as titled panels (`panel({ around, title: 'DiT block ×N' })`); boxes sized to their
  label with 6–8 pt of padding (a shared bar spanning its inputs takes `bar: true`); notes and
  masks beside what they explain; two text sizes on every page, 8 pt (16) and 7 pt (14), nothing
  smaller, and no gray words lighter than #666 (`color: 'muted'` prints #666); math with scripts
  at label size (16), so its scripts stay 5.5 pt or more; labels a few words in the paper's
  notation; no prose, the caption explains. A double-column page you size yourself
  stays 2.8 in tall or less.
- Data glyphs: the project's own sample images (`image({ src })`) when it has some; otherwise CC0
  photos stand in (`image({ kind: 'cat' })`): ask the person for a few samples or a dataset
  folder. Icons (`icon`, `figures kit icons`) mark actors, modalities and tools sparingly, never
  as decoration. Common architectures have templates (`template('transformer' | 'moe' | 'lora'
  …)`, `figures kit templates`); vary a template to the paper rather than copying its default
  (`template('dit', { h, w, tokens, variant: 'adaLN-Zero' | 'in-context' })` fills a tall page
  and shows the latent tokens in and out). The person's saved parts are in `figures kit
  library`, and `savePart(name, ids)` saves one when they ask.

**Style.** The prompt says who chose the style: keep the person's choice; when Aster's default
applies, pick the preset for the kind of figure. Each figure has one colour preset, kept on its page: `fig.style('graphite' | 'slate' |
'outline' | 'blue-amber' | 'sage-butter' | 'tonal' | 'print-mono' | 'illustrative' |
'categorical', { accent })`; `figures kit colors` shows them. Pick by what colour means: one
accent for the contribution (graphite, the default), ours vs. given (blue-amber), module types
(sage-butter), kinds (categorical). Any `accent` (a swatch or #hex) is derived into tint, strong,
ink and solid; colour by role names (`accent-strong`), never library hex. Three or four roles
with a meaning (trained, frozen, data or target, loss) plus the one accent for the new component;
tint a panel only when the tint means something (the contribution, one of two compared methods),
else give the group a title and a thin outline (`panel({ color: 'none', outline: true })`): one
gray or peach tint behind the whole drawing encodes nothing. Math is typeset by
MathJax; `\text{}` comes out serif, so mix words and math with `text({ runs })`. `figures check`
warns when a figure looks generated: outlines in the fill's own hue, one pastel step for every
hue, library default colours, violet by default, red off a red loss, prose, legends,
placeholders, faint gray words or content, hairline arrows, boxes over 60% empty, one tint
behind everything, arrows over text, long detours, routes with many bends or along a shape's
edge, a loss link across a data arrow or a loss name floating alone, uneven spacing, a lone flame
badge, data glyphs under 24 px at print, empty regions, a page over a fifth blank, short dashed
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
- Colour by role, not one light-blue template: tint operation types apart when it helps
  (attention, FFN, norm), an extra hue only with a meaning; predictions and targets marked the
  same way throughout; velocity or noise outputs drawn as images, not feature grids; concrete
  data (video frames on a time axis, captions that match their thumbnails).
- Structure: module boundaries as panels, "×N" markers, consistent arrow weights.
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
objective there; one hero; colours by role; no empty boxes or regions; labels clear of arrows and
heads; would a reviewer call it a generic flowchart? Before you finish, open the print-size PNG
it also prints (150 dpi, the figure's width on paper) and check every label is still easy to
read. Fix and repeat, at most three rounds. When `preview` times out, Aster is almost always
still rendering: run it again with the longer `--wait` it names, and only if that times out too,
go on from `figures check` and say so in your reply. When it prints a WARNING that the PNG is
blank, the scene has something Aster cannot draw: fix that before judging anything.

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
fig.style('graphite', { accent: 'blue' }) // 'illustrative' for an overview or teaser
const seq = fig.tokens({ id: 'in', x: 16, y: 240, boxed: false,
  items: ['A', 'cat', '<BOI>', { image: 'cat', view: { x: 0, y: 0, w: 0.5, h: 0.5 } }, '<EOI>'] })
fig.box({ id: 'tf', label: 'Transformer', x: 16, y: 170, w: seq.width, h: 44, bar: true, color: 'strong' })
for (const t of seq.cells) fig.arrow({ id: `${t.id}-up`, from: [t.x + t.w / 2, 236], to: [t.x + t.w / 2, 218] })
fig.box({ id: 'enc', label: 'encoder', math: 'E_\\theta', x: 340, y: 40, color: 'accent' })
console.log(await fig.save()) // { errors, warnings, notes }
```

- **Math** is TeX (double the backslashes in a JS string): `x_t`, `s^{(i)}` (brace scripts),
  Greek and symbol macros, `\mathcal{L}` (printed L), accents in scripts (`E_{\bar\theta}`); arrow
  `label` is TeX, `labelText` plain text.
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
  false. Text adds `text`, `originalText`, `fontSize`, `fontFamily` 9 (Liberation Sans: Latin,
  Greek, `√ × · ± ≤ ≥ ≈ ∞ ∂ ∑ ∫ → ← ℓ`; no bold or italic), `textAlign`, `verticalAlign`,
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

## Rules

- Never execute training or evaluation merely to populate records.
- Never hand-edit `run.json`, `metrics.jsonl`, `media.jsonl`, `summary.json`, `project.json`, or `claims.json`; use the CLI.
- When results already exist elsewhere and the mapping is ambiguous, report the candidate Experiment and Run with source paths. Do not guess an execution state, dataset revision, metric unit, or launch commit.
- Run `validate` after changing the catalog and repair only issues your changes caused. Aster imports valid catalog Experiments and Runs automatically.
- Do not delete files, move code, switch Git branches, push, or copy large artifacts as part of tracking. If the project has no catalog, run `init` only when the user is beginning research work in that project; it creates `.aster/` and, unless you pass `--manuscript` for an existing paper, `paper/main.tex`.
