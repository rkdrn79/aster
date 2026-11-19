# Transcription notes: naive plans, batch B

Judgement calls made while transcribing four naive plans into `aster.plan/v1`. Each line is one ambiguous choice.

## Shared across fixtures

- `scope.compute` holds only the input's hardware text (no `gpuHours`, no `source`) when the plan states no budget (plain-opus, design-opus, plain-sonnet).
- `statistics.seedsMain` is the smallest seed count the plan states for claim-bearing headline cells (3 in all four); per-dataset seed counts are on each cell.
- Claim `kind` is classified from the claim text. `weight` and `status` are set only where the plan states them (design-opus, playbook-opus), plus `argued-only` where the plan says a claim is argued, not tested.
- The three DST fixtures share one component list (M1–M15) taken from input.md's method. The variance derivation ("Motivation") is treated as analysis, not as a component.
- Latency and storage comparators (dense kernels, CSR engines, narrow dense, etc.) go in `costMeasurements[].methods`, not in `baselines`.
- A dense model described as the "upper reference" gets role `oracle` in all three DST fixtures.
- Every cell cost uses `source: "estimate"`, because each plan labels its numbers as rough or planning values.

## naive-dst-plain-opus.json (46 cells)

- The plan's "Priority order" 1–5 becomes stages P1–P5, with no gates. Tiers come only from explicit words: "Keep … spine" → must; cut-ladder items, "optional", and "if you can get Ampere" → could. All other cells have no tier.
- `cost.gpuHoursEach` uses the plan's per-run figures (CIFAR ~1.5 GPU-h, ImageNet R50 ~200 GPU-h), so grouped cells undercount. The plan's block totals (~900 + ~5,000 + ~3,500 ≈ 9,400 GPU-h, plus "small") are not encoded.
- MobileNet/ViT ImageNet runs (~150–300 GPU-h each, a range) and the simulations or benchmarks ("small") have no cost.
- The cost table is an estimate of the planned work, not a budget, so there is no `scope.compute.gpuHours`.
- QA `minEffect` is the plan's example margin ("for example, within 0.5 pp … overlapping 95% CIs"), not a committed number.
- ImageNet R50 is split into headline cells (90/95%, 3 seeds) and rest-of-grid cells (1 seed), following the plan's seed rule.
- `A.in.r50.baselines` (the other Block A methods on ImageNet) is implied by "accuracy vs sparsity curves for each architecture", but it conflicts with the ~25-run ImageNet R50 budget.
- Cut-ladder item 4 ("ImageNet seeds beyond the headline points") is not mapped to a cell because its meaning is unclear.
- Block B runs are assumed to be on CIFAR, from priority item 2 ("CIFAR A + B").
- B1, B2 and B4 are `analysis` entries because they add no runs. The two B3 controls are cells. The pre-narrowed control has no `compareTo` because the plan does not say what it is compared with.
- Block C γ sweep cells have purpose `main` because they are Claim 3's primary evidence; they are also listed under ablation A-gamma.
- The ViT γ sweep is in stage P5 (priority 5 names ViT), although the rest of Block C is P4.
- Static constant fan-in appears twice: as a baseline (role `ablated-self`) and as ablation A-static. A-static has no component because it removes the whole DST loop.
- The E3 static mask-type comparison is not linked as an ablation of M1, because the plan frames it as training-dynamics analysis.
- `QF-overhead` is a separate question linked to C1, because the plan says the overhead row supports Claim 1. The other Block F rows (QF) have no claim.
- Block F cells use `compareTo: A.cifar.methodx`, the default MethodX on CIFAR-100 R18 at 90/95%.
- Baseline tuning is only a slogan ("same budget used to tune γ_sal"). It goes in `fairness.tuning.space` with no `trials`.
- The fairness note "same ERK, ΔT, α, update-end, augmentation, epochs" is applied to the DST baselines only: RigL, SET, the third DST method, and block DST.
- SET, MEST/Top-KAST/GraNet, SR-STE, channel pruning, block DST and narrow dense have no role, because the plan gives none.
- `variance: "ci95"`; the plan reports mean ± std together with a 95% CI.
- `hyperparameters.sensitivity` also lists the Block F schedule and gradient-accumulation sweeps as knobs.
- The `else` branch of the "Claim 1 wording" decision point is inferred from "only once".
- The single risk (small fan-in is hardest for constant fan-in) comes from the dataset section.
- The plan's advice to reword Claims 1 and 5 is not applied to the claim texts.

## naive-dst-design-opus.json (12 cells)

- Claim weights: C1 is main and C2–C5 are secondary, from "the ablation, theory, and latency claims become secondary experiments".
- RigL gets role `closest-prior` ("the only difference should be the mask-update rule"). Its `source` is left out because the plan asks the user whether to use their own code or the reference code.
- RigL `reproduce` points at the CIFAR S1 cell and records both tolerances (0.3 pp CIFAR, 0.5 pp ImageNet). The plan defines no ImageNet reproduction run.
- The optional "SET or static ERK mask" gets role `no-training-floor` (the plan calls it "a floor"), tier `could`, and no stage or seeds.
- Stages: S1 is "First runs (in order)", S2 the full CIFAR grid, S3 ImageNet, S4 the secondary experiments.
- The S1 gate is the RigL reproduction requirement. Confirming δ before any run is recorded in Q1's `minEffect` text, not as a gate.
- The grid's "3 arms" are read as MethodX, RigL and strict.
- ImageNet cells cover only MethodX and RigL at 90/95%; the plan does not state other ImageNet sparsities or a strict arm.
- The dataset for first-run steps 3–5 is recorded as "CIFAR", since the plan names CIFAR-10 only in step 2. CIFAR-100 is listed only because the primary-metric split mentions it.
- The γ_sal sweep is a tuning cell with no seeds and no `methodTrials`; 4 values × 2 sparsities is not stated as a trial count.
- Q2 and Q3 share the strict CIFAR cell (question array). Their per-layer readouts are `analysis` entries.
- The plan's open questions to the user (budget, ViT, δ, RigL implementation, 1× vs extended training, first/last-layer sparsity) have no field and are not encoded.
- The variance simulation has no cost: the plan says "CPU, minutes" but gives no number.
- `statistics.test` is free text (paired non-inferiority on the CI), because the plan names no test.
- 99% is pre-registered as exploratory. This is recorded in Q1's text and as a risk.

## naive-dst-playbook-opus.json (44 cells)

- Budget: 4,032 A100-h, `source: "assumed"` (the plan's own assumption, "must be confirmed before S0"), with `wallclockDays: 42`. The rerun reserve (300) and the committed total (3,295) are not encoded.
- Cell IDs get a stage prefix where the plan's ID had none (T0 → S2.T0, M1 → S2.M1, A1 → S3.A1, C0 → S0.C0, C1 → S4.C1, …). This avoids collisions with claims C1–C8 and components M1–M15.
- The [CUT] cells A11 and C5 (ImageNet-C) are left out of the matrix. A11 is in `notCompared`; ImageNet-C is not in `datasets`.
- Restore-ladder cells A8 and A9 are kept with tier `could` and `cost.total: 0`, which is how the plan counts them ("0 (9)").
- Stage cost sums equal the plan's subtotals: 16 / 222 / 2,277 / 430 / 50 = 2,995.
- Mixed seed counts take the larger value ("5 / 3" → 5, "3 / 1" → 3). A2-Q4 "+2 (→ 5)" → 2. "—" → no seeds.
- A "compared to" entry naming arms inside the same cell (e.g. M1: "RigL, GraNet") or an external number (S1.5: "RigL paper") is not encoded as `compareTo`.
- QC6 and QC7 were created because the matrix ties S0.0 to "C6" and M1/M2 to "C7" without a Q. T0's "Q: all" → Q1–Q7.
- Claim kinds: C1 "performance + generality" → performance; C3 "efficiency + performance" → efficiency; C5 "analysis/mechanism" → analysis. C8 ("background") has no kind or weight and is `argued-only`.
- `minEffect` is set only where the plan writes "Minimum effect" (Q1, Q3). Q2 reuses Q1's δ without restating it.
- Baseline roles: Chase ("closest structured DST") and SR-STE ("closest N:M learner") → `closest-prior`; dense → `oracle`; static → `no-training-floor`. Post-hoc projection, RigL+abl and one-shot get no role.
- Baseline source: GraNet, Chase and SR-STE are `rerun-official-code` (public code is assumed). RigL's source is left out, because the S0 fallback ("switch both arms to the official RigL code") implies the default may be their own implementation.
- Gates G1–G6 and the S3/S4 rules are `decisionPoints` with `after` = stage ID and the gate name prefixed in `if`. The S1 stage gate only summarises them.
- S2 and S3 have no gate; the plan says S2 has "no test-based narrowing gate".
- The C2 decision's `then: keep the C2 claim` is the implied pass branch.
- The Q4 selection rule is in S3.A2-Q4's factors, and the C3 γ_sal rule in S4.C3's factors.
- Purposes: S0.0, C0, C1, C2 → cost; S1.1, S1.4, S1.5 → pilot; P1, P2, C3, C4 → analysis; A2 → sensitivity (the plan speaks of "γ_sal sensitivity"); A2-Q4 → main (Q4 test cells); M-MB, M-ViT, M5, M6 → generality.
- Datasets keep the plan's per-row split, so CIFAR-100 appears three times (one per architecture). The MobileNetV2 row's role is `stress` (the matrix calls it "depthwise stress"). The ViT-Tiny row has no role, because "generality" is not an enum value.
- A-unstructured's cells include S2.M4 (ImageNet dense) because the plan's component table says "M1–M5".
- `tuningCostIncluded: true`, because T0, T-arch and T-IN are costed in the budget.

## naive-instseg-plain-sonnet.json (36 cells)

- Question IDs E1–E7 follow the plan's experiment numbers. E7 ("supports all claims") is not linked to any claim.
- C1 ("first") is `argued-only`, from "this is a literature claim, not an experimental one". C1 and C6 have no kind because none fits.
- Stages P0–P4 come from "run a pilot … before the full grid" and the "rough ordering for a limited budget".
- Cells not named in that ordering have no stage: E3 COCO, E1 long-tailed, E4 ADE20K, E5, E6, E7, and the equal-iterations run.
- Tier is set on only two cells: E3.classbal.lt is `must` ("not optional if you claim class-balanced normalization works") and E4.fourth-arch is `could` ("optional").
- No cell has a cost: the plan gives no GPU-hours, and "≈13 full-run equivalents" is not GPU-hours.
- Cityscapes E1 cells carry all 3 architectures, because the plan says the Cityscapes full grid "covers E1 to E4". COCO E1 is Mask R-CNN only.
- On COCO the plan says "about 8 methods" without naming them, so the cells are grouped as ours / random / baselines.
- E1.longtail is included from "all methods × keep fractions × datasets", although the priority list uses the long-tailed set only for the class-balance ablation. E4 names ADE20K separately.
- E3 ablations are split per dataset (Cityscapes at all budgets, COCO at 30/50%), with 3 and 1 seeds from the shared seed rule. The class-balance ablation also runs on the long-tailed set.
- Seeds: Cityscapes 3, COCO 1. E1.coco.variance is a separate cell for ours and random with 3 seeds at one or two keep fractions.
- Baseline roles: random has none (not described); the trivial annotation-only baselines are `simplest` ("trivial"); the raw P/A sum is `ablated-self`.
- The adapted model-based criteria have `source: reimplemented`, since they are adapted through the recipe.
- No full-data reference training cell, even though the retention metric needs one; the plan never states it as a run.
- Dataset roles: the long-tailed set is `stress`; the unnamed simple-mask dataset is `ood` ("different dataset type").
- `humanEval.needed: true`, from "for example by manual inspection of a sample". The low-quality-fraction metric has `judged: true`.
- Decision points: rewrite the boundary story (after E2), soften the "first" wording, reduce the COCO input size. "If it wins only at some budgets, say so" stays as E1's `predictionIfFalse`.
- Risks come from the "against you" lines, the E3/E7 caveats and "Things to watch".
- The implementation-detail checks are grouped into one cell (E3.impl-sensitivity) and are also listed as hyperparameter sensitivity knobs.
- No `selectionSplit`: the method has no hyperparameters and the plan names no selection split.
