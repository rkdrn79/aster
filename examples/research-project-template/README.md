# Aster research project template

This is a **blank structure**, not a completed experiment. No metric, run status, result, or PDF is supplied. Copy the `research/` directory into a project only when you want a project-owned research layout. For an existing project, prefer the safe CLI so it preserves files already there:

```sh
node src/research-harness/cli.mjs init --project /absolute/path/to/project
node src/research-harness/cli.mjs experiment --project /absolute/path/to/project --name "Baseline"
node src/research-harness/cli.mjs new-run --project /absolute/path/to/project --experiment baseline --name "seed 42"
node src/research-harness/cli.mjs validate --project /absolute/path/to/project
```

The commands are run from the Aster source checkout. `new-run` prints the absolute paths to enter in Aster's **Attach Run** form after writing actual metrics. It does not execute training.
