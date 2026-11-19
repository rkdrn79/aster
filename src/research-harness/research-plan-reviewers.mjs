// What reviewers ask for, measured: 682 OpenReview reviews of 167 ICLR/NeurIPS 2023-25 papers,
// share of papers with at least one request per category (research/reviews/reviewer-pressure.md).
// The pre-mortem's simulated reviewers are grounded in these rates, and the plan checks use them.

/**
 * `protected`: categories reviewers ask for most and that budget cuts removed in the playbook
 * trial (coverage of what papers ran fell from 72% to 51%). A likely request in one of them
 * defaults its plan items to `must` and is never cut for cost without the person deciding.
 */
export const REVIEW_CATEGORIES = [
  {
    id: 'missing-baseline',
    label: 'Missing baseline',
    rate: 74,
    protected: true,
    reviewer: 'R1',
    ask: 'a specific prior method, by name, that the plan does not compare against',
    answeredBy: 'baselines (with a role and a reason) or notCompared with a reason'
  },
  {
    id: 'analysis',
    label: 'Analysis, failure cases, qualitative',
    rate: 71,
    protected: false,
    reviewer: 'R3',
    ask: 'when and why the method helps or fails, per slice, with examples; why it is weaker somewhere',
    answeredBy: 'analysis entries (failure-cases, slices, a contingent analysis with budget)'
  },
  {
    id: 'missing-dataset',
    label: 'Missing dataset or domain',
    rate: 70,
    protected: true,
    reviewer: 'R2',
    ask: 'a harder, real-world, out-of-distribution or standard benchmark the plan leaves out',
    answeredBy: 'datasets with a heldout/ood/stress role, or scope.outOfScope with a reason'
  },
  {
    id: 'cost',
    label: 'Cost and efficiency',
    rate: 59,
    protected: true,
    reviewer: 'R2',
    ask: 'what the method itself costs (time, memory, FLOPs, tokens) against its main baseline',
    answeredBy: 'costMeasurements and a cost cell'
  },
  {
    id: 'claim-gap',
    label: 'Claim not supported',
    rate: 58,
    protected: false,
    reviewer: 'R3',
    ask: 'a claim the planned experiments would not actually show, or a gain too small to matter',
    answeredBy: 'a question with a minimum effect per main claim, or the claim marked argued-only'
  },
  {
    id: 'missing-ablation',
    label: 'Missing ablation',
    rate: 48,
    protected: true,
    reviewer: 'R3',
    ask: 'which component, by name, causes the gain; a run without it',
    answeredBy: 'ablations, one per method component, or a reason'
  },
  {
    id: 'hyperparameters',
    label: 'Hyperparameter sensitivity',
    rate: 47,
    protected: false,
    reviewer: 'R1',
    ask: "how the method's own knobs were chosen and how sensitive results are to them",
    answeredBy: 'hyperparameters.selectionSplit and a sensitivity sweep'
  },
  {
    id: 'unfair-comparison',
    label: 'Unfair comparison',
    rate: 42,
    protected: false,
    reviewer: 'R1',
    ask: 'whether baselines got the same data, backbone, budget and tuning trials; reproduced numbers',
    answeredBy: 'baselines[].fairness with equal tuning trials and a reproduction cell'
  },
  {
    id: 'metric',
    label: 'Metric choice',
    rate: 31,
    protected: false,
    reviewer: 'R1',
    ask: 'why this metric; a second metric where the primary is contested',
    answeredBy: 'metrics with a reason each, and a secondary metric'
  },
  {
    id: 'model-variety',
    label: 'More backbones or model families',
    rate: 26,
    protected: false,
    reviewer: 'R2',
    ask: 'another architecture, model family or scale for a generality claim',
    answeredBy: 'generality cells at two or more regimes, or scope.outOfScope'
  },
  {
    id: 'seeds',
    label: 'Seeds and variance',
    rate: 14,
    protected: false,
    reviewer: 'R3',
    ask: 'more seeds, error bars, variance across runs',
    answeredBy: 'statistics.seedsMain >= 3 and a variance statistic'
  },
  {
    id: 'leakage',
    label: 'Leakage or test-set tuning',
    rate: 7,
    protected: false,
    reviewer: 'R2',
    ask: 'whether test data, pretraining data or tuning on test inflates the result',
    answeredBy: 'leakageChecks and selection on validation'
  },
  {
    id: 'human-eval',
    label: 'Human evaluation',
    rate: 7,
    protected: false,
    reviewer: 'R3',
    ask: 'human ratings, or a judge validated against people',
    answeredBy: 'humanEval and a judge-validation cell'
  },
  {
    id: 'statistical-test',
    label: 'Statistical test',
    rate: 6,
    protected: false,
    reviewer: 'R3',
    ask: 'a significance test or confidence interval of the difference',
    answeredBy: 'statistics.test or a CI-of-difference rule'
  }
]

export const REVIEW_CATEGORY_IDS = REVIEW_CATEGORIES.map((category) => category.id)

export function reviewCategory(id) {
  return REVIEW_CATEGORIES.find((category) => category.id === id) ?? null
}

/** Categories every plan should hear at least one simulated request in (asked of ≥ 25% of papers). */
export const COMMON_CATEGORY_IDS = REVIEW_CATEGORIES.filter((category) => category.rate >= 25).map(
  (category) => category.id
)

/**
 * Three simulated reviewers, as real panels split the work: each owns the categories its
 * expertise makes it ask about, so together they cover every category.
 */
export const PREMORTEM_REVIEWERS = [
  {
    id: 'R1',
    name: 'the closest-prior expert',
    expertise:
      'has published on the methods this work builds on and knows their code, numbers and tuning tricks',
    values: 'strong, fairly tuned baselines; reproduced numbers; justified metrics',
    tone: 'precise and sceptical; names methods and papers'
  },
  {
    id: 'R2',
    name: 'the breadth and practicality reviewer',
    expertise: 'uses methods like this in practice, across datasets, domains and hardware',
    values: 'results beyond one benchmark; honest cost; no leakage',
    tone: 'pragmatic; asks what it costs and whether it holds elsewhere'
  },
  {
    id: 'R3',
    name: 'the evidence and mechanism reviewer',
    expertise: 'cares about whether experiments show what the paper claims, and why',
    values: 'claims matched by evidence, component ablations, analysis of failures, error bars',
    tone: 'careful; asks "what would show this is wrong?"'
  }
]

export function premortemReviewer(id) {
  return PREMORTEM_REVIEWERS.find((reviewer) => reviewer.id === id) ?? null
}

export function reviewerCategories(reviewerId) {
  return REVIEW_CATEGORIES.filter((category) => category.reviewer === reviewerId)
}
