# Aster Research demo

This directory contains **synthetic demo data** for the Runs and Compare screens. It is not a real training result or a benchmark claim. No training command is run by Aster when these files are attached.

In the Aster workspace, create an Experiment named `Demo · LoRA comparison`. Attach each `metrics.jsonl` below as a separate Run, with the neighboring `train.log`, `config.json`, and `run.json` as optional files. Then select both Runs in Runs and open Compare.

| Run             | Metric source            | Validation accuracy at step 400 |
| --------------- | ------------------------ | ------------------------------: |
| Demo · baseline | `baseline/metrics.jsonl` |                            0.72 |
| Demo · rank 16  | `rank-16/metrics.jsonl`  |                            0.76 |

The manifests record matching evaluation conditions and metric definitions for the demo. Both leave launch-time code provenance unavailable. The figures are illustrative and do not establish that rank 16 improves a model.

## Writing demo

`paper/main.tex` is a synthetic one-page manuscript, and `paper/main.pdf` is its compiled output. In Writing, link `examples/research-demo/paper/main.tex` to the Demo Experiment and use `examples/research-demo/paper/main.pdf` as its preview. The PDF was built with `tectonic -X compile main.tex --outdir .`. The manuscript makes no real research claim.
