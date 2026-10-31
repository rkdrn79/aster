---
name: aster-research-adopt
description: >-
  Reorganize an existing research project folder (paper, bibliography, experiment results)
  into Aster's .aster/ layout with .aster/project.json, on a git branch, after the user
  approves a written plan, or without approval in unattended mode when Aster's "Organize with
  agent in background" menu item starts it. Use when the user opens or imports an existing
  research folder in Aster and asks to organize, adopt, migrate, or restructure it "into Aster's
  format", says "$aster-research-adopt", or asks why Aster's Writing, Runs or catalog import
  cannot find their paper or results. Do not use for a brand-new empty project; Aster's "Set up
  research folders" button already covers that.
---

# Adopt an existing project into Aster's layout

The goal is a project Aster can read: the paper in Writing, references in Library, and past
results as Experiments and Runs. Aster keeps its own records in `.aster/` (ADR-004). Everything
else belongs to the user and stays where it is; the catalog only records where the paper is.

```text
<project>/
  .aster/
    project.json                      # path map: project-relative "/" paths only, no Run list
    experiments/<slug>/experiment.json
    experiments/<slug>/analysis/
    experiments/<slug>/runs/<run-id>/{run.json, metrics.jsonl, train.log, config.json?, artifacts/}
    library/papers/*.pdf              # git-ignored by .aster/.gitignore
  <paper folder>/main.tex ...         # where it already is; registered, not moved
  src/ scripts/ configs/ data/ ...    # untouched
```

| What you find                                                        | Goes to                                    | How                                                        |
| -------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------- |
| Paper directory (main TeX file and what it includes)                 | stays; registered as the manuscript        | `init --manuscript <main .tex>`                            |
| Bibliography the paper uses                                          | stays; registered                          | `init --bibliography <.bib>`                               |
| Related-work PDFs                                                    | one existing folder: registered; else copy | `init --papers <dir>`, or copy to `.aster/library/papers/` |
| Past results: metrics, logs, configs of one attempt                  | `.aster/experiments/<slug>/runs/<id>/`     | copy; the original stays                                   |
| A `research/project.json` from Aster before `.aster/`                | `.aster/` and `paper/`                     | `migrate` (below)                                          |
| Code, notebooks, datasets, checkpoints, environments, sbatch scripts | where they are                             | never moved                                                |

A project with no paper yet gets `paper/main.tex` from `init` without path options.

## The harness

Run `aster research harness-path` on the machine that holds the project. It prints the
version-matched absolute path to `cli.mjs`; use that path with Node. Call its parent directory
`HARNESS` below and substitute the real path. An installed skill's own directory is not the
harness. If the Aster CLI is unavailable in a source checkout, use the `cli.mjs` beside this
source skill instead. Do not guess a path in a packaged app or another host.
On an SSH host without a `node` (20 or newer), use the `node` path from
`aster research harness-path --json`. If it reports no bundled harness, ask the user to update
Aster and reconnect the host.

```bash
node HARNESS/cli.mjs init       --project "$PWD" [--manuscript paper/main.tex] [--bibliography paper/refs.bib] [--papers related/]
node HARNESS/cli.mjs migrate    --project "$PWD" --dry-run     # only for an older research/ layout
node HARNESS/cli.mjs experiment --project "$PWD" --name "LoRA r16"
node HARNESS/cli.mjs new-run    --project "$PWD" --experiment lora-r16 --name "seed 42" --id seed-42 \
  --capture-phase imported [--config path/inside/project.json] [--command "python train.py ..."] \
  [--commit <40-64 hex SHA> --captured-at <ISO time>]
node HARNESS/cli.mjs validate   --project "$PWD"
```

`init` creates `.aster/` and only the files that are missing; its path options make the catalog
point at the user's existing paper, bibliography, and PDF folder, so it creates nothing there.
`experiment` derives the slug from the name. `new-run` creates the run folder, `run.json`, an
empty `metrics.jsonl` and `train.log`; the catalog lists it from its folder, and it never
overwrites an existing run. `migrate` moves an older `research/` tree to `.aster/` and `paper/`,
fixing the paper's relative `\bibliography` and figure paths and the claims ledger, and keeps the
old catalog as `.aster/local/research-project.v1.json`. Use these commands instead of
hand-writing `project.json`, `experiment.json`, or `run.json`.

## Workflow

### 1. Preflight (read-only)

- Work from the workspace root. Run `git status --porcelain` and `git branch --show-current`.
- Uncommitted changes: stop and ask the user to commit or stash first. Never stash for them.
- Not a git repository: ask whether to run `git init` and commit a snapshot first. If they decline,
  continue in copy-only mode: copy instead of `git mv` and leave every original in place.
- `.aster/project.json` already exists: run `validate` first and only fill the gaps it reports.
- `research/project.json` exists (Aster's layout before `.aster/`): plan a `migrate` instead of
  the moves below. Show the user `migrate --dry-run`, and run `migrate` on the branch.

### 2. Survey (read-only)

- List tracked files with `git ls-files`, plus untracked result folders that git ignores (for
  example `outputs/`, `results/`, `runs/`, `logs/`, `wandb/`, `lightning_logs/`, `slurm-*.out`).
  Skip `.git`, virtual environments, `node_modules`, datasets, and checkpoints (`*.pt`, `*.ckpt`,
  `*.safetensors`); report their sizes instead of reading them.
- Paper: the `.tex` containing `\documentclass` and `\begin{document}`. Follow `\input`, `\include`,
  `\includegraphics`, `\bibliography`, `\addbibresource`, `\usepackage` of local `.sty`, and
  `latexmkrc` / `Makefile` / `.vscode` LaTeX settings to find everything the paper needs.
- Results: per attempt, find metric files (`.csv`, `.jsonl`, `.json`, TensorBoard events), logs,
  and the config used. Read only the first lines of large files. Group attempts into Experiments by
  what the user varied (method, model, ablation), and derive a stable run ID from the folder name
  or seed. Run IDs must match `^[a-z0-9][a-z0-9-]{0,63}$` (for example `seed42` → `seed-42`).
- Note anything that refers to paths you plan to move or copy: scripts, CI, Makefiles, README
  links. Normally only `research/` moves (by `migrate`); the paper stays.

### 3. Plan, then wait

Show the user a plan and wait for approval before writing anything:

1. Paths: the main TeX file, the PDF it builds, the bibliography, and the PDF folder you will
   register with `init`; any copies or `migrate` moves, with every reference you will edit.
2. Experiments and Runs to create: name, slug, run ID, source files, and how each metric file
   becomes `metrics.jsonl`.
3. What stays and why. Files you could not classify, as questions.
4. The branch name (default `aster/research-layout`).

Ask about anything ambiguous: which TeX file is the paper, how attempts group into Experiments,
and whether a run's commit was really recorded when it ran. Apply the user's corrections.

### 4. Apply (only after approval)

1. Unless the user already created a fresh branch or worktree for this, run
   `git switch -c aster/research-layout`.
2. An older `research/` layout: run `migrate` and skip to step 5.
3. Run `init` with the approved `--manuscript`, `--bibliography`, and `--papers` paths. Without
   them it creates an empty `paper/main.tex` and `paper/references.bib`, which is right only for a
   project that has no paper yet.
4. Related-paper PDFs scattered across the project: copy them into `.aster/library/papers/`. Combine
   several bibliographies only if the user agreed.
5. Results: for each approved run, run `experiment` once per Experiment, then `new-run` with
   `--capture-phase imported` (or `unknown`). Fill the run:
   - Append each metric observation to the run's `metrics.jsonl`, one JSON object per line:
     `{"schemaVersion":1,"runId":"<run id>","step":<number>,"split":"train","metrics":{"loss":1.82}}`.
     `runId` must equal the run ID, and every metric value must be a finite number or `null`.
     Convert CSV or JSON with a small script and keep the original column names as metric names.
     Include `step` and `split` only when the source states them. Never invent steps, splits, or
     values that the source does not contain.
   - Copy the training log into `train.log`, and other small outputs into `artifacts/`. `--config`
     takes only a JSON file inside the project; copy YAML or other configs into `artifacts/`. Do not
     copy files over 50 MB; list their original paths in your final report instead.
   - Pass `--commit` and `--captured-at` only when the result itself recorded them. A commit you see
     today is not launch-time provenance; never use `--capture-phase at_launch` for it.
6. Search for the old paths you moved (`git grep`) and update the remaining references.
7. Keep the `.gitkeep` markers generated by `init` and `experiment` for empty record folders.
   Git does not track empty directories, and `validate` fails on a fresh clone without them.

### 5. Verify

- `node HARNESS/cli.mjs validate --project "$PWD"` must report no issues.
- If `latexmk` or `pdflatex` is available, build the paper before (on the original branch) and after;
  report any new errors.
- Show `git status --short` and a short `git diff --stat`. Commit on the branch with a message that
  lists what moved and what was imported. Do not merge, push, or delete the branch.

### 6. Report

Tell the user what moved, what was copied, what stayed, and anything you skipped. Then explain
the next steps in Aster:

- Aster automatically links valid catalog Experiments and Runs in a local workspace; invalid or missing sources remain visible as errors.
- **Runs → From project catalog** lets the user inspect and manually attach an unlinked result.
- **Writing → From project catalog** fills the manuscript path from `.aster/project.json`.

To undo, switch back to the previous branch and delete `aster/research-layout`.

## Unattended mode

Aster's **⋯ → Organize with agent in background** menu item starts this skill in a background
chat that the user is not watching, and the request says "unattended mode". Follow the workflow above with these
changes. The Rules below still apply.

- Preflight: if the folder is not a git repository, or `git status --porcelain --untracked-files=no`
  lists changes, write nothing. Say what blocks you and what the user should do (commit or stash;
  or `git init` and a first commit), then end your turn. Never initialize, commit, or stash for
  the user. Untracked files may stay, and you never move them.
- Skip "Plan, then wait". Decide on your own, and keep the plan for the commit message and report.
- Resolve ambiguity conservatively instead of asking:
  - Paper: prefer the TeX file named by `latexmkrc`, `Makefile` or `.vscode` settings, or the one
    whose PDF sits beside it. If more than one candidate remains, leave the paper in place and
    list the candidates in the report.
  - Bibliography: move only the bib the paper uses, and never combine several.
  - Experiments: one per top-level results folder unless folder names make the grouping obvious,
    and one Run per attempt folder.
  - Leave every file you cannot classify where it is.
- Branch: `aster/research-layout`, or the first free `aster/research-layout-2`, `-3`, ….
- Stage only what you moved, created, or edited: `git add .aster` (plus `paper` and the old
  `research` paths after a `migrate`) and the files whose references you fixed. Never use
  `git add -A` or `git add .`.
- After the commit, stay on the new branch so Aster shows the layout. In the report, name the
  previous branch and the undo command: `git switch <previous> && git branch -D <new branch>`.
- If a command is denied or needs approval you cannot get, stop and say which one.

## Rules

- Never delete, overwrite, or `git rm` user files. Result originals always stay.
- Never rewrite history, force anything, push, or merge.
- Never run training, evaluation, or data-processing scripts; only read their outputs.
- Never move code, data, checkpoints, or environment files, even if they look messy.
- Never write outside the project or use absolute paths in `.aster/project.json`.
- For a remote (SSH) workspace, run every command on the host where the files live.
