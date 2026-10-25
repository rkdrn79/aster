---
name: aster-research-verify
description: Verify an Aster research result before reporting it. Use after a Run, before comparing Experiments, and before citing result numbers in a manuscript. Works with .aster/project.json and older research/project.json projects; does not replace a human scientific review.
---

# Verify research evidence in Aster

This skill works with `aster-research-track`; it does not start an agent, rerun training, or
approve a scientific conclusion. Run `aster research harness-path` on the machine that holds the
project; it prints the version-matched absolute path to `cli.mjs`. Let `H` be its parent directory.
An installed skill's parent is not necessarily the harness. In a source checkout without the
Aster CLI, the parent of this **resolved** skill directory contains `cli.mjs`.

1. Read `node H/cli.mjs context --experiment <slug>` and the Experiment brief. State the question, primary metric, baseline, evaluation dataset/split/revision, and which facts are missing.
2. Run `node H/cli.mjs verify --experiment <slug> --json`. Use `--run <experiment>/<run>` for a particular Run. Use `--paper` before reporting numbers from the manuscript. The command reads records only. It combines catalog validation, Run states, open rule and recorded findings, claim audit, and a heuristic manuscript-number scan. A `blocked` verdict exits 1; `needs_review`, `insufficient_evidence`, and `checks_clear` exit 0. **Always read `verdict`; exit code 0 does not mean the research is verified.**
3. Trace each relevant finding ID to its evidence (metric, log lines, run manifest, sample, or source file). Inspect raw files for claims that matter. A successful process exit is evidence of execution, not of model quality. A missing baseline, split, or provenance limits what can be compared. An agent's prior summary is not a source.
4. Check what rules cannot settle: data leakage, mismatched eval code or split, selective reporting, sample quality, statistical uncertainty, and whether the observed result actually addresses the question. If you can cite concrete evidence of a new problem, record it through `quality add` according to `aster-research-track`. Do not duplicate a rule finding. Do not mark a finding accepted or dismissed; only the user does.
5. Report in three parts: **observed evidence** (Run refs, values, conditions, source locations), **unresolved checks** (finding IDs and missing information), and **bounded conclusion** (what can and cannot be said). Use `checks_clear` only to say that the automated checks found no open issue. Do not call it proof, an independent replication, or an endorsement of the hypothesis.

If the project has no Runs, `insufficient_evidence` is expected. If a Run is still running or its state is unknown, report that state rather than announcing a result. A user-accepted finding is an acknowledged limitation, not a correction. `--paper` scans the whole manuscript, even when `--experiment` scopes the Run findings; unbacked-number candidates need manual inspection because the scan is heuristic. The catalog validation also covers the whole project.
