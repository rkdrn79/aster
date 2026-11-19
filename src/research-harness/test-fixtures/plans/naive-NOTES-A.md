# Transcription notes (naive plans, batch A)

Judgement calls made while transcribing the Markdown plans into `aster.plan/v1`. One line each.

Shared by all four:

- `method` is a summary of input.md. The three ts-aug fixtures use the same 12 `methodComponents`, taken from input.md's method. Separate Adam optimizers are left out as training machinery.
- `kind` on claims is my classification from the claim text. `weight` is set only where a plan says main/secondary or names a primary claim.
- Roles are mapped from each plan's own description. Where the description fits no enum value, `role` is left out ("compute control", "context", "if feasible" methods).
- A plan "re-run" of an external method maps to `rerun-official-code`. The plans' own variants (loss-only, grids, controls) have no `source`.
- Extra nested keys hold stated text that has no schema field: `tests`, `note`, `notes`, `days`, `suites`, `delayProcesses`, `untunedDefault`, `evaluation`.

## naive-ts-aug-plain-opus.json (14 cells)

- Claims are the five rows of the plan's section 8 claim-evidence map, not input.md's four claims. E4 is linked to C1 (from the map) and to C3 (section 4's heading "Claims 1 and 2", where input claim 2 is the instantiation claim).
- Q1's hypothesis comes from the section title "SOTA on forecasting and classification". "Gains fall within seed std" goes into `predictionIfFalse`, not `minEffect`.
- No `scope.compute.gpuHours`. The "~1.2-1.5k GPU-h" is a cost estimate, not a budget. Only the hardware is recorded.
- Cells follow the plan's experiment numbering. E1.1-E1.3 is one cell, because the plan gives one cost for it. E4's 12 ablation variants are one cell (one row in the budget table), and every ablation entry points to it.
- Range costs use the upper end (E1: 600-900 becomes 900). Where one cost covers several experiments, the number sits on the first cell and the other cells carry only a `note`: E3.1+E3.2 = 30; E5.1+E5.2 = 150; E2.2+E5.4+E3.3+E6 = 150.
- Tiers: P0 = must, P1 = should, P2 = could. E3.3 is "could" because the P2 row names "E3.3 anomaly detection". E1.pilot, E2.1.capacity-control and E5.3 have no tier because they are not in the priority table.
- Stages come from the "Order of work" list. S2 is called a go/no-go check, but the plan gives no criterion, so it has no `gate`.
- `seeds` is left out where the plan does not say: E5.2 shares the "x 3 seeds" row with E5.1 but gets no seed count.
- B13 (the best grid configuration) is `oracle` because the plan calls it "the oracle". The no-augmentation identity baseline (B15) and the supervised forecasters (B11) have no role.
- "Same tuning budget for baselines and ours" is a slogan, so it goes in `fairness.tuning.space` and `hyperparameters.notes`. No `trials` anywhere.
- E3.2's Prop-1 variant (g only, η off, h = 1) is recorded as ablation A14 on M1 and M3. M10 (L_global) is never ablated, so it has no `ablation` field.

## naive-ts-aug-design-opus.json (10 cells)

- The plan focuses on one claim and calls it primary. It is C2 (`weight: main`), in the plan's wording. C1, C3 and C4 use input.md's text. C3 and C4 are never tested (no evidence).
- Q2 (H2) is linked to C2 and also to C1, because the plan says a failed H2 "undercuts the 'good view' claim".
- No `minEffect`: the plan explicitly asks the user for the effect size. "CI excludes 0 on ≥3/4 datasets" is a significance rule, kept in the hypothesis and statistics.
- Each numbered run in "First runs, in order" is its own stage (S0-S5). Pass criteria become gates only for Runs 0-2. Runs 3-4 ("choose by val MSE only") and Run 5 ("see hypothesis") have no gate.
- Run 5 ("arms 1-4 + your method") is split into 5 cells so that `compareTo` can pair ours with each arm. The random-mask control is `main` (it carries H2). The η-only arm is `ablation` (the plan calls it an ablation).
- No costs: the plan says only "well under a day" on 8 GPUs. No tiers.
- The classification experiment ("after H1 resolves") and the questions to the user are mentioned but not designed, so they are not transcribed.

## naive-ts-aug-playbook-opus.json (38 cells)

- `scope.compute` is 3,226 GPU-h with `source: assumed`. The 21-day window is the plan's own assumption; the input gives hardware only.
- C1a is `argued-only`, as the plan states. It still lists the Q6 questions as evidence, because the plan says its "empirical consequences [are] tested in Q6". C2c is `argued-only` with no evidence (S0-4 is only a sanity cell).
- C2b's kind "performance + efficiency" is reduced to `performance`.
- Q3 and Q6 are split into their stated sub-questions (Q3a/b/c; Q6a, Q6b, Q6b-prime, Q6c, Q6d). Q6c's `predictionIfFalse` comes from the S3 decision rule, since its "Against" list omits (c).
- Cells that list several questions get the first one listed: "Q1-Q3" and "all" become Q1, and "Q3" becomes Q3a. Cells whose Q column is "—", "cost", "native", "comp …", "sensitivity", "analysis" or "robustness" have no question.
- Purposes: S2-14 oracle, S2-15 native-protocol table and S4-7 stress are `analysis`. S0-5, S1-2 and S1-3 are `pilot`. S4-5's "3 rep" becomes `seeds: 3`. Every cost is `estimate`, because they are assumed per-seed costs recalibrated in S0-3.
- Matrix totals reconcile with the plan: 2,882 GPU-h; by stage 44/136/1,687/600/415; by tier must 2,487 / should 385 / could 10.
- Role mapping: loss-only is `ablated-self`; grid and RandAug ("recipe") are `standard-recipe`; CoST ("strongest contrastive forecasting") is `strongest-recent`. TS2Vec compute-matched, LEAVES, SimMTM, TS-TCC and the copied context rows have no role.
- Baseline trials sit in each baseline's `fairness.tuning.trials` (8; grid 21; RandAug 9). TS2Vec compute-matched "inherits TS2Vec's config", so it has no `trials`. `methodTrials` = 8; the untuned arm (0 trials) is recorded in `untunedDefault`. `tuningCostIncluded: true` because the tuning rows are inside the budget.
- Sensitivity knobs have no `levels`, because the plan says "3 non-default points" without values.
- Component 11 (L_con vs the hierarchical loss) is ablation A11, linked to M10 and M11. M10's ablation points to A11. M5 is `none`, with the plan's reason. Per-instance adaptivity and cropping ablations have no component.
- S3 has no `gate`; its rules are decision points. S4's "Q5 gate" is used as its gate. Contingency cuts and reserve use are recorded as stopping-rule strings. The 40-item "Changes" log is not transcribed.

## naive-rl-delay-plain-opus.json (26 cells)

- Costs are converted from the plan's "heavy runs" to GPU-hours: runs × 48 (one run = 2 GPUs × ~1 day, from the plan and input). Run counts use the plan's "example: 8 games, 3 seeds". T1 = 456 runs and T2 = 504 runs reconcile.
- The T3 row (≈150-250 runs for the large-delay sweep, sticky actions, E4 and the 400k runs) is costed once, on E2.large-delay-sweep, at the upper end (250 × 48 = 12,000). The other T3 cells carry only a `note`.
- E0 and E1 are "CPU only", so they are costed at 0 GPU-h. Delayed-Q and DC/AC cells have no cost ("much cheaper", not quantified).
- E3 says "same games and methods", but T2 budgets only MethodX and Oblivious under i.i.d./heavy-tailed delays. Augmented, Delayed-Q and DC/AC under those delays are therefore cells with no tier and no cost.
- Tiers: T1 = must, T2 ("strongly expected") = should, T3 ("strengthens") = could.
- The stages come from "run E0 first" and "make sure E0, E1 and a 2-game E5 pilot work before scaling". The second sentence is partly conditional on T1 being too long.
- `seedsMain` = 3 (the stated minimum). The "5 for the headline configuration" is in notes, because the headline configuration is not named.
- Roles: Oblivious is `ablated-self` (the same agent ignoring the delay); Augmented is `standard-recipe` ("the principled-but-exponential alternative"); Delayed-Q is `closest-prior` (forward-model, constant-delay); DC/AC-style has no role; delay-free is `oracle` ("upper-bound reference").
- Three decision points have `after: "pre-launch compute check"` (not a stage), from "Before launching, find out how many GPU pairs…".
- The large-delay sweep is `sensitivity` under Q2. Sticky actions and distribution shift are `generality`. The sticky-actions dataset has role `stress`; the tabular MDPs have no role.
- The "delay hidden" ablation (A6) has no component, because observing z_t is not one of the seven modifications. No ablation covers M1 (queues) or M4 (MCTS from the predicted latent).
