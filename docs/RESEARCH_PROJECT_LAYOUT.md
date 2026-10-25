# Aster research project records

Current contract (2026-10-25). The layout implementation lives in
`src/research-harness/research-layout.mjs`; the CLI and desktop use that module when opening a
project. This document describes the implemented behavior, including compatibility limits.

```text
project/
  paper/                         default manuscript and bibliography; an existing folder may be registered
  .aster/
    project.json                 schemaVersion 2: path map, no Experiment or Run list
    claims.json                  manuscript claims and Run evidence, when present
    experiments/<slug>/
      experiment.json
      runs/<id>/run.json
      runs/<id>/metrics.jsonl
      runs/<id>/train.log
    library/
    local/                       device-bound state; git-ignored
    cache/                       generated state; git-ignored
```

`readCatalog` derives the Experiment and Run list from those folders. A Run created in another
worktree can appear after its files are brought into the project without rewriting one central Run
index. The CLI refuses invalid IDs, linked record roots, and paths escaping the project. The app
keeps the host, workspace, and source path when linking a Run.

Projects with `research/project.json` schemaVersion 1 stay in that layout until the user chooses
to migrate. `migrate --dry-run` reports the planned moves; the app shows that plan before applying
it. Migration moves known records, fixes known TeX references and claim paths, retains the old
catalog under `.aster/local/`, and reports leftovers. It does not silently reorganize arbitrary
code, datasets, or checkpoints. A failed migration can require manual inspection before retrying.

The host RPC `researchProject.read` provides project records to mobile and to a desktop connected
to a runtime-owning host. Direct SSH workspaces do not yet have the same bounded project-record
API. Desktop `userData/research/research.json` and `library.json` still hold client records, so
project records are not yet the only writable source for all research metadata. Runtime-hosted
catalogs can be linked on desktop; creating an Experiment in the app still requires a local
workspace. A future change should move project-scoped writes behind the host and leave client
storage for view state and device-bound links only.

Delegated agent status uses observed evidence: launch requested, prompt delivery confirmed or
unknown, agent progress reported, and agent finished. Agent completion does not mark research
verification complete. This follows the evidence-boundary principle in
[oh-my-hermes' harness quality contract](https://github.com/rlaope/oh-my-hermes/blob/main/docs/HARNESS_QUALITY.md)
without installing Hermes or creating another agent runtime.
