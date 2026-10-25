# Research workspace

- `project.json`: project-owned index for writing, references, Experiments, and Runs.
- `manuscript/main.tex`: manuscript source. A compiled `main.pdf` can live beside it.
- `references/library.bib`: bibliography; put chosen PDFs in `references/papers/`.
- `experiments/<slug>/experiment.json`: the name and folder identity.
- `experiments/<slug>/runs/<run-id>/`: one immutable execution attempt's manifest, metric stream, log, optional config snapshot, and artifacts.

Aster's current local Research records remain separate. The catalog helps link files; it is not a scheduler and does not make a Run succeeded. Connect a Run explicitly in Aster.
