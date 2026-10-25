---
name: aster-research-start
description: Set up a new Aster research project and its first Experiment without reorganizing existing code or data. Use when a user starts research in a new or mostly empty project, asks for a research repository layout, or wants Aster Writing and Experiments connected. For importing a populated research folder, use aster-research-adopt instead.
---

# Start research in an Aster project

Keep the user's conversation as the place where they direct work. Aster's `.aster/` directory is
the index for Experiments, Runs, claims, and the Library; code, datasets, checkpoints, and an
existing manuscript stay in their current locations. `paper/` is only a default for a project
without a manuscript. Do not create a second copy of an existing paper.

Run `aster research harness-path` on the machine that holds the project. It prints the
version-matched absolute path to `cli.mjs`; use that path with Node. In a source checkout
without the Aster CLI, `cli.mjs` is in the parent of this resolved skill directory.

1. Inspect the project root for `.aster/project.json`, legacy `research/project.json`, and an
   existing main `.tex`, `.bib`, and papers directory. If it is already set up, read `context`
   and `validate`; use the existing layout. If it contains substantial unorganized past results,
   use `aster-research-adopt` so those sources are mapped deliberately.
2. For a new project, run `node <cli> init --project <root>`. Pass `--manuscript`,
   `--bibliography`, and `--papers` with project-relative paths when the user already has those
   files. `init` creates only missing files and never moves code or data. Show the user the
   paths it selected; if multiple plausible manuscripts exist, identify them before choosing.
3. Create an Experiment only for a concrete research question, using
   `node <cli> experiment --project <root> --name "<question or method>"`. Reuse a matching
   Experiment rather than making one per chat, seed, or run.
4. Record the agreed question and evaluation contract with `brief set --experiment <slug>`.
   For example, `--question "Does LoRA r16 improve validation accuracy?"`
   `--primary-metric accuracy:maximize:validation` and `--dataset-id <id>` if known.
   Missing metric, split, dataset revision, baseline, or evaluator revision remain unset; do
   not invent them. A brief can be completed after the first conversation.
5. Run `node <cli> validate --project <root>` and, for the first Experiment,
   `node <cli> preflight --project <root> --experiment <slug> --json`. Report its blockers
   and warnings as missing research decisions; setup can finish before the first Run is ready.
   Report the resulting folders and what is still unspecified. When actual experiments begin, follow
   `aster-research-track` so execution and manuscript numbers have source records.

Do not run training merely to populate the catalog. Do not move or delete source files,
checkpoints, or datasets as part of setup. Do not create Git branches or push changes unless
the user asked for that separately.
