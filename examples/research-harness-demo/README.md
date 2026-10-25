# Aster research demo

A small research project that exercises every research feature in Aster. **Everything in it is
synthetic.** `scripts/train_demo.mjs` (a LoRA sentiment "fine-tune") and
`scripts/render_demo.mjs` (an image "denoiser") are seeded simulators: they train nothing, but
they print the same `ASTER_METRIC` and `ASTER_MEDIA` lines real training code would. Every Run
was launched through the harness (`run exec`), and every brief, finding, proposal, rating, and
note was written with the harness CLI by `scripts/seed-quality-demo.mjs`. That script plays a
Claude Code session and a Codex thread for the agent records, and plays you for the decisions.

## Open it in Aster

1. Switch the sidebar to **Research** (the Research | Code switch at the top left).
2. **Home → Add project** and pick this folder, `examples/research-harness-demo`. Add the folder
   itself, not the repository around it.
3. Aster reads `.aster/project.json` and links all five Experiments and their Runs on its
   own. Open **Denoiser samples** in the sidebar first; it has the most to show.

Each Experiment opens on its **notebook** (plan, decisions, results, analyses, conclusion) with
the **Experiment agent** docked on the right. Curves, comparisons, sample ratings, and media are
one level down, under **Details**. Code changes belong to **Workbench**; the manuscript to
**Writing**; papers to **Library** (ADR-003 in the Aster workspace docs).

| Experiment          | Runs                                                                            | Look for                                                                 |
| ------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Denoiser samples    | linear seed 1 (baseline), cosine seed 1, cosine lr 2e-3 (failed), linear seed 2 | Images per step, rollout videos, agent judge vs. you, a pending proposal |
| LoRA rank ablation  | rank 4, rank 16 (baseline), rank 64 (SLURM job 48213), rank 64 seed 3           | Seed rule, resolved and dismissed findings, text A/B, claim mismatch     |
| Learning-rate sweep | lr 1e-3 (failed), lr 3e-4 (baseline), lr 1e-4 (uncommitted edit)                | Failed log, View patch, rejected proposal, research loop, conclusion     |
| Warmup schedule     | warmup 500 (launcher died), cosine (logged by hand)                             | Baseline from another Experiment, step mismatch                          |
| Demo ablation       | demo seed 1 (older scaffold)                                                    | A brief without a baseline                                               |

## 5-minute tour: Denoiser samples

**Notebook** (top to bottom)

- **Plan**: the question, hypothesis, metric (`val psnr ↑`), baseline (`linear seed 1`), seeds
  (at least 2), evaluation, and rubric. **Edit** changes them. **Planned runs** are the agent's
  proposals with their state: _Rerun the linear baseline with seed 2_ is done (it became
  `linear seed 2`, shown with its PSNR and difference), _Run the cosine schedule with seed 2_ is
  only proposed.
- **Needs you**, only what waits on a decision:
  - **cosine lr 2e-3 failed** (exit 1). **Ask agent** sends it to the Experiment agent to
    diagnose; **Dismiss** sets it aside.
  - **Run the cosine schedule with seed 2**, with the agent's reason and exact command.
    **Approve** lets the agent launch it; **Reject** asks for a reason the agent will read.
  - Warnings with evidence: a NaN `ASTER_METRIC` line in the failed Run's log, and **3 more**
    (too few seeds; cosine's +0.27 dB is smaller than the 0.41 dB gap between the two linear
    seeds; a checkerboard on sample `s3`). **All findings** opens every finding, including
    resolved and dismissed ones.
- **Results**: one row per configuration. The two linear seeds share a row as mean ± spread with
  **Seeds 2**; cosine has 1. **Last** / **Best** switches the value. A row opens the Run in Details.
- **Analysis**: what the agent concluded from the Runs, newest first, each with a takeaway, the
  Runs it used, and a preview: _PSNR summary by run_ (a table) and _Val PSNR by step_ (a chart).
  **Use in paper** sends it to the Writing agent with a request to cite it and record a claim.
- **Conclusion**: yours to write; _Ask agent to draft_ only asks the chat for a draft.

**Experiment agent** (right). **Claude** or **Codex** starts a chat that first reads the
Experiment and replies with a short status. The buttons above it ask for **Design**, **Analyze**,
**Explain failure**, **Next run**, or a **Full review**. It designs and analyzes: it proposes
Runs for your approval, writes analysis scripts and records results with `analysis add`, and
never edits code here. A Run that needs code is proposed with "needs code"; after you approve it,
**Implement in Workbench** hands it to a Workbench coding chat.

**Details** (header, or any Run or result row): **← Notebook · Runs | Compare | Outputs**

- **Runs**: `cosine lr 2e-3` shows _Failed · exit 1_, curves that stop before step 250, and the
  NaN in the log. Any Run's **Media** shows the `rollout` video, `samples` grids at steps 100,
  200, and 300, and one `denoised` image per sample.
- **Compare**: tick `cosine seed 1` on Runs (the baseline is always included) to see last and
  best values, curves, and the `noise_schedule` difference between the Runs' configs.
- **Outputs**: **Side by side**, **Rate each**, and **A/B** (optionally **Blind**) on samples
  `s1`–`s4`, with counts and _n_ for you and the agent judge; you disagree with the judge on
  `s4` (**User–agent disagreements**). **Judge with agent** rates every sample with `rubric.md`.
  **Media** lines up each Run's `rollout`, `samples`, or `denoised` files; videos play together.

**The other Experiments, a minute each**

- **LoRA rank ablation**: analyses _Val accuracy by rank_ (table) and _Is rank 64 worth its
  cost?_ (note); a failed claim (the paper says 86.4% where `rank 64` logged 85.77%); in **All
  findings**, the agent's single-seed finding **resolved** once `rank 64 seed 3` reproduced the
  gain, and "rank-4 mislabels 2 samples" **dismissed** by you with a note.
- **Learning-rate sweep**: a concluded plan with your conclusion; the analysis _Train loss by
  learning rate_ (red lr 1e-3 diverges); `lr 1e-3` failed with the agent's diagnosis citing log
  lines; `lr 1e-4` ran from an uncommitted edit (Details → Runs → **View patch**); a **rejected**
  proposal with your reason.
- **Warmup schedule**: the baseline is a Run of another Experiment (`learning-rate-sweep/lr-3e-4`).
  `warmup 500` is still marked running though its launcher died. `cosine (logged by hand)` stops
  at 300 of 600 steps (`compare.step-mismatch`).
- **Demo ablation**: its plan names no baseline, so `compare.baseline-missing` stays until you
  pick one with **Edit**.

## How agents fit in

Each surface has its own agent and its own record (ADR-003 in the Aster
workspace docs). The **Experiment agent** designs and analyzes; a **Workbench** chat
changes code; the **Writing** agent edits the manuscript. They pass work through records in
`.aster/`, not through each other's chats: a "needs code" proposal goes to Workbench, results
come back as Runs, and an analysis goes to Writing with **Use in paper**.

The `aster-research-track` skill tells agents to launch every experiment with `run exec`, and when
a Run ends to:

1. `organize --run <ref>`: refresh `summary.json` (primary metric, baseline difference, counts).
2. `check`, `run show`, `media`: read the exit, metrics, log tail, and samples.
3. `quality add`: record each problem they can back with evidence (a metric value, log lines, a
   file, a `run.json` field, a sample, or a claim). The harness checks every item against the
   files and refuses values that disagree.
4. `rate add --by agent --judge-model …`: judge the outputs when the plan has a rubric.
5. `analysis add`: record a chart, table, or note under the Experiment's `analysis/` folder with
   its takeaway.
6. `run annotate`: leave one short note on the Run.

A Run an agent thinks of itself goes to `proposal add` and waits; once you approve it, the agent
launches exactly that command and records `proposal launched`. Accepting or dismissing findings,
approving proposals, user ratings, and the conclusion stay yours: the harness refuses
`proposal decide`, `proposal handoff`, and `--by user` from an agent shell.

**From training code to records.** `run exec` reads two kinds of lines from the command's output:

```text
ASTER_METRIC {"step": 100, "split": "val", "metrics": {"psnr": 24.1, "loss": 0.03}}
ASTER_MEDIA {"path": "…/artifacts/samples/step_100.png", "step": 100, "label": "samples"}
```

The first becomes a `metrics.jsonl` row (curves, Compare, summaries), the second a `media.jsonl`
row (gallery, media compare). Sample outputs go in the Run folder's `outputs.jsonl` (`sampleId`,
`prompt`, `output`, `media: [{kind, path, label}]`), which Aster links to the Outputs tab by
itself. `scripts/render_demo.mjs` does all three; the command finds its folders in `ASTER_RUN_DIR`
and `ASTER_RUN_ARTIFACTS`. In Python each line is one
`print("ASTER_METRIC " + json.dumps({...}), flush=True)`.

## Try it yourself

Run these from this folder; `H` is the harness in this checkout.

```sh
H=../../src/research-harness/cli.mjs

# 1. Approve "Run the cosine schedule with seed 2" (Denoiser samples → Needs you), then run its
#    command. --delay-ms 1500 slows the simulator to about 20 s so you can watch it live.
node $H run exec --experiment denoiser-samples --id cosine-seed-2 --name "cosine seed 2" \
  --config configs/denoiser-cosine-seed-2.json --metric-def psnr:maximize:dB --metric-def loss:minimize \
  --dataset-id synth-shapes --dataset-revision v1 --split val --evaluator-revision psnr-1 \
  -- node scripts/render_demo.mjs --schedule cosine --seed 2 --delay-ms 1500

# 2. Link the proposal to its Run (an agent does this after launching; refused before Approve).
node $H proposal launched --experiment denoiser-samples --id proposal-2 --run denoiser-samples/cosine-seed-2

# 3. What an agent reads next.
node $H check --run denoiser-samples/cosine-seed-2
node $H media --run denoiser-samples/cosine-seed-2
```

While it runs, Details → **Runs** lists `cosine seed 2` as running, its curve grows every 1.5 s, and
the `samples` images appear at steps 100, 200, and 300; the rollout video arrives at the end. When
the command exits, `run exec` writes `summary.json`, so **Results** shows its PSNR against
`linear seed 1` (it lands below it: the cosine gain was seed noise), and the `stats.too-few-seeds`
warning for cosine clears. Then press **Analyze** in the Experiment agent to get a new analysis
in the notebook, or rate its samples in Details → Outputs.

The LoRA simulator works the same way and writes `outputs.jsonl` and media as well:

```sh
node $H run exec --experiment warmup-schedule --id warmup-200 --name "warmup 200" --metric-def acc:maximize \
  -- node scripts/train_demo.mjs --lr 3e-4 --rank 16 --seed 3 --warmup 200
```

New Runs record this repository's commit and any uncommitted changes. To undo your additions:
`git restore . && git clean -fd .aster/experiments`.

## Writing, Claims, Library

**Writing** opens `paper/main.tex` with the compiled `main.pdf`; Compile PDF
rebuilds it, with SyncTeX for jumping between source and PDF. The **Claims** panel shows four
claims backed by Run metrics: two verified, one mismatch (the paper says 86.4% for rank 64; the
Run logged 85.77%), and one stale (`lr 1e-4`'s metrics changed after the claim was recorded).
**Unbacked numbers** lists result-like numbers no claim covers. **Library** uses
`paper/library.bib`.

```sh
node $H context       # the summary an agent reads first
node $H validate      # exits 1: the rank-64 claim mismatch is intentional
node $H claim audit
node $H claim scan
```

## Regenerate the data

`scripts/seed-quality-demo.mjs` rebuilds the briefs, findings, proposals, ratings, notes,
summaries, and the Denoiser samples Experiment from the base demo (the four original Experiments),
using the harness CLI only:

```sh
node scripts/seed-quality-demo.mjs --fresh /tmp/aster-demo
rsync -a --delete --exclude 'library/papers/*.pdf' /tmp/aster-demo/.aster/ .aster/
```

`--fresh` exports the base demo from git (the commit before the seed script was added, or
`--base-ref REF`), adds this folder's `scripts/`, `configs/`, and base `train.log` files, and
commits the copy as a throwaway repository so the new Runs record a clean commit. It needs `git`
and `tar`; without `ffmpeg` on PATH the Runs have no rollout video. `--project DIR` seeds an
existing copy of the base demo in place. Each run changes timestamps, commits, and paths, but not
the values.

| Path                                                | What it is                                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `scripts/train_demo.mjs`, `scripts/render_demo.mjs` | The simulators; `png.mjs` is their PNG writer                                                          |
| `scripts/seed-quality-demo*.mjs`                    | The seed: entry point, harness calls, and the records it writes                                        |
| `configs/*.json`                                    | Each Run's config, copied as its `config.json`                                                         |
| `.aster/experiments/<slug>/experiment.json`         | The Experiment and its brief; `rubric.md` beside it                                                    |
| `quality.jsonl`, `proposals.jsonl`, `ratings.jsonl` | Findings, proposals with your decisions, and sample ratings                                            |
| `runs/<id>/`                                        | `run.json`, `metrics.jsonl`, `train.log`, `media.jsonl`, `outputs.jsonl`, `summary.json`, `artifacts/` |

The older LoRA and learning-rate Runs first wrote `outputs.jsonl` under `artifacts/`; those
originals stay (`rank 16` attaches its file by reference), and the copies in each Run folder are
the ones Aster links.
