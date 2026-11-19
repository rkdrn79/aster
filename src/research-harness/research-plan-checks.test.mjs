import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { PLAN_CHECKS, planFindings } from './research-plan-checks.mjs'

// The exemplar is the plan-format.md example made complete: it passes every check. Each case
// below breaks one thing a naive plan or the playbook trial got wrong and expects its finding.
const exemplar = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, 'test-fixtures', 'plans', 'exemplar-ts-aug.json'),
    'utf8'
  )
)

function plan(mutate = () => {}) {
  const copy = structuredClone({ ...exemplar, id: 'ts-aug', revision: 3 })
  mutate(copy)
  return copy
}

const cell = (doc, id) => doc.matrix.find((entry) => entry.cell === id)
const request = (doc, id) => doc.premortem.requests.find((entry) => entry.id === id)
const checks = (doc) => planFindings(doc).map((finding) => finding.check)

const cases = {
  'plan.claim-unmapped': (doc) =>
    doc.claims.push({ id: 'C5', text: 'Works on irregular series', kind: 'robustness' }),
  'plan.hypothesis-unfalsifiable': (doc) => delete doc.questions[0].predictionIfFalse,
  'plan.min-effect-missing': (doc) => delete doc.questions[0].minEffect,
  'plan.question-orphan': (doc) =>
    doc.questions.push({
      id: 'Q9',
      claim: 'C1',
      text: 'Unused',
      hypothesis: 'h',
      predictionIfFalse: 'p',
      minEffect: 'm'
    }),
  'plan.baseline-roles': (doc) => (doc.baselines = doc.baselines.filter((b) => b.id !== 'B3')),
  'plan.baseline-unjustified': (doc) => delete doc.baselines[0].why,
  'plan.baseline-search-missing': (doc) => delete doc.baselineSearch,
  'plan.closest-prior-missing': (doc) => delete doc.baselineSearch.closest,
  'plan.closest-prior-few': (doc) =>
    (doc.baselineSearch.closest = doc.baselineSearch.closest.slice(0, 2)),
  'plan.closest-prior-unresolved': (doc) => delete doc.baselineSearch.closest[2].reason,
  'plan.closest-prior-unidentified': (doc) => delete doc.baselineSearch.closest[0].arxiv,
  'plan.tuning-asymmetric': (doc) => (doc.baselines[1].fairness.tuning.trials = 5),
  'plan.tuning-saturation': (doc) => delete doc.hyperparameters.saturationCheck,
  'plan.tuning-uncosted': (doc) => {
    delete doc.hyperparameters.tuningCostIncluded
    cell(doc, 'S1.saturation-B1').purpose = 'sensitivity'
  },
  'plan.budget-asymmetric': (doc) => delete doc.baselines[0].fairness.trainingBudget,
  'plan.copied-supports-claim': (doc) => (doc.baselines[2].source = 'copied'),
  'plan.baseline-not-reproduced': (doc) => delete doc.baselines[0].reproduce,
  'plan.component-unablated': (doc) => delete doc.methodComponents[3].reason,
  'plan.ablation-no-default': (doc) => delete doc.ablations[0].default,
  'plan.mechanism-unprobed': (doc) =>
    (doc.analysis = doc.analysis.filter((entry) => entry.kind !== 'mechanism-probe')),
  'plan.hparam-sensitivity': (doc) => delete doc.hyperparameters.sensitivity,
  'plan.seeds-too-few': (doc) => (cell(doc, 'S2.main-ours').seeds = 2),
  'plan.variance-unspecified': (doc) => delete doc.statistics.variance,
  'plan.difference-rule-missing': (doc) => delete doc.statistics.test,
  'plan.multiplicity': (doc) =>
    (cell(doc, 'S2.main-ours').compareTo = doc.matrix.slice(0, 11).map((entry) => entry.cell)),
  'plan.selection-on-test': (doc) => (doc.hyperparameters.selectionSplit = 'test'),
  'plan.protocol-per-arm': (doc) => delete doc.protocol.checkpoint,
  'plan.leakage-unchecked': (doc) => (doc.leakageChecks = []),
  'plan.metric-unjustified': (doc) => delete doc.metrics[1].why,
  'plan.judge-unvalidated': (doc) => (doc.metrics[0].judged = true),
  'plan.heldout-missing': (doc) => (doc.datasets[3].role = 'main'),
  'plan.generality-single-regime': (doc) =>
    (cell(doc, 'S4.cost').factors = { ...cell(doc, 'S4.tstcc').factors }),
  'plan.out-of-scope-empty': (doc) => (doc.scope.outOfScope = []),
  'plan.cost-unmeasured': (doc) => (doc.costMeasurements = []),
  'plan.analysis-missing': (doc) =>
    (doc.analysis = doc.analysis.filter((entry) => entry.kind !== 'failure-cases')),
  'plan.contingent-analysis-missing': (doc) => delete doc.analysis[2].budgetGpuHours,
  'plan.cost-missing': (doc) => delete cell(doc, 'S3.abl-h').cost,
  'plan.cost-unsourced': (doc) => delete cell(doc, 'S3.abl-h').cost.source,
  'plan.cost-basis-missing': (doc) =>
    doc.matrix.forEach((entry) => (entry.cost.source = 'estimate')),
  'plan.no-reserve': (doc) => (doc.scope.compute.gpuHours = 400),
  'plan.optional-padding': (doc) =>
    ['S1.saturation-B1', 'S3.abl-lt', 'S3.sens-beta-M', 'S4.tstcc'].forEach(
      (id) => (cell(doc, id).tier = 'could')
    ),
  'plan.no-decision': (doc) => {
    doc.questions.push({ id: 'Q9', text: 'Unlinked', hypothesis: 'h', predictionIfFalse: 'p' })
    cell(doc, 'S4.masks').question = 'Q9'
  },
  'plan.team-overload': (doc) => (doc.scope.team = { people: 1, weeks: 2 }),
  'plan.budget-assumed': (doc) => (doc.scope.compute.source = 'assumed'),
  'plan.budget-unknown': (doc) => delete doc.scope.compute,
  'plan.over-budget': (doc) => (doc.scope.compute.gpuHours = 100),
  'plan.cuts-needed': (doc) => (doc.scope.compute.gpuHours = 320),
  'plan.stage-over-budget': (doc) => (doc.stages[2].budgetGpuHours = 100),
  'plan.no-sanity-stage': (doc) =>
    doc.matrix
      .filter((entry) => entry.stage === 'S0')
      .forEach((entry) => (entry.purpose = 'pilot')),
  'plan.order-not-cheap-first': (doc) => (cell(doc, 'S1.saturation-B1').cost.total = 300),
  'plan.no-cheap-falsifier': (doc) => (cell(doc, 'S1.pilot-ours').purpose = 'sanity'),
  'plan.gate-missing': (doc) => delete doc.stages[1].gate,
  'plan.no-stopping-rule': (doc) => (doc.stoppingRules = []),
  'plan.over-engineered': (doc) => {
    doc.statistics.test = ['paired-bootstrap', 'wilcoxon']
    doc.statistics.equivalenceTest = 'TOST'
  },
  'plan.benchmark-drift': (doc) => (doc.datasets[0].replaces = 'ETTm2 at horizon 720'),
  'plan.premortem-missing': (doc) => delete doc.premortem,
  'plan.review-uncovered': (doc) =>
    (doc.premortem.requests = doc.premortem.requests.filter((entry) => entry.category !== 'cost')),
  'plan.demand-dropped': (doc) =>
    (request(doc, 'PM5').resolution = { as: 'out-of-scope', reason: 'too expensive' }),
  'plan.untiered': (doc) => delete doc.matrix[0].tier
}

test('the exemplar plan passes every check', () => {
  assert.deepEqual(planFindings(plan()), [])
})

test('every check has a case', () => {
  assert.deepEqual(Object.keys(cases).sort(), Object.keys(PLAN_CHECKS).sort())
})

for (const [check, mutate] of Object.entries(cases)) {
  test(`${check} fires on the broken plan`, () => {
    const findings = planFindings(plan(mutate)).filter((finding) => finding.check === check)
    assert.ok(findings.length, `${check} did not fire; got ${checks(plan(mutate)).join(', ')}`)
    for (const finding of findings) {
      assert.equal(finding.severity, PLAN_CHECKS[check])
      assert.equal(finding.source, 'rule')
      assert.equal(finding.layer, 'design')
      assert.equal(finding.plan, 'ts-aug')
      assert.match(finding.id, new RegExp(`^rule:${check.replace('.', '\\.')}:ts-aug/`))
      assert.ok(finding.text.length > 10)
      assert.ok(finding.evidence.every((item) => item.kind === 'plan' && item.revision === 3))
    }
  })
}

test('findings come most severe first', () => {
  const findings = planFindings(
    plan((doc) => {
      delete doc.premortem
      delete doc.matrix[0].tier
      doc.leakageChecks = []
    })
  )
  assert.deepEqual(
    findings.map((finding) => finding.severity),
    ['fail', 'warn', 'info']
  )
})

test('stated reasons and the person’s consent clear the checks they answer', () => {
  const excused = plan((doc) => {
    doc.baselines[1].fairness.tuning.trials = 5
    doc.baselines[1].fairness.tuning.asymmetryReason = 'InfoTS has one knob; 5 trials cover it'
    doc.datasets[0].replaces = 'ETTm2 at horizon 720'
    doc.datasets[0].consent = 'user'
    doc.leakageChecks = []
    doc.leakageReason = 'no pretrained models; splits are by time'
    delete doc.statistics.test
    doc.statistics.testReason = 'min effect over seed spread decides'
    doc.claims[1].status = 'argued-only'
    doc.premortem.notApplicable = []
  })
  const fired = checks(excused)
  for (const check of [
    'plan.tuning-asymmetric',
    'plan.benchmark-drift',
    'plan.leakage-unchecked',
    'plan.difference-rule-missing',
    'plan.generality-single-regime'
  ]) {
    assert.ok(!fired.includes(check), `${check} fired: ${fired.join(', ')}`)
  }
})

test('selection is read from the plan, the baselines or the datasets, and prose naming validation passes', () => {
  const selecting = (split, mutate = () => {}) =>
    checks(
      plan((doc) => {
        doc.hyperparameters.selectionSplit = split
        mutate(doc)
      })
    ).includes('plan.selection-on-test')
  assert.equal(selecting('held-out validation split, not the test set'), false)
  assert.equal(selecting('test set'), true)
  assert.equal(
    selecting('val', (doc) => (doc.metrics[0].split = 'val')),
    true
  )
  assert.equal(
    selecting(undefined, (doc) => delete doc.hyperparameters.selectionSplit),
    false,
    'every baseline names val'
  )
})

test('cells without a seed count use the plan-wide one', () => {
  const unset = plan((doc) => doc.matrix.forEach((entry) => delete entry.seeds))
  assert.ok(!checks(unset).includes('plan.seeds-too-few'))
  unset.statistics.seedsMain = 2
  assert.ok(checks(unset).includes('plan.seeds-too-few'))
})

test('a pre-mortem category may be waived with a reason, not without', () => {
  const silent = (reason) =>
    plan((doc) => {
      doc.premortem.requests = doc.premortem.requests.filter((entry) => entry.category !== 'metric')
      doc.premortem.notApplicable = [{ category: 'metric', reason }]
    })
  assert.ok(!checks(silent('the benchmark fixes the metric')).includes('plan.review-uncovered'))
  assert.ok(checks(silent('')).includes('plan.review-uncovered'))
})

test('likely reviewer demands are must cells, so the must tier can go over budget', () => {
  // S4.cost is a should cell (18 GPU-h), but PM5 (missing dataset, high) points at it.
  const at300 = (mutate = () => {}) =>
    checks(
      plan((doc) => {
        doc.scope.compute.gpuHours = 300
        mutate(doc)
      })
    )
  assert.ok(at300().includes('plan.over-budget'))
  const unlinked = at300((doc) => (request(doc, 'PM5').likelihood = 'low'))
  assert.ok(!unlinked.includes('plan.over-budget'))
  assert.ok(unlinked.includes('plan.cuts-needed'))
})

test('a budget without a source counts as invented; an unknown one asks the person', () => {
  assert.ok(checks(plan((doc) => delete doc.scope.compute.source)).includes('plan.budget-assumed'))
  const unknown = checks(plan((doc) => (doc.scope.compute = { source: 'unknown' })))
  assert.ok(unknown.includes('plan.budget-unknown'))
  assert.ok(!unknown.includes('plan.over-budget') && !unknown.includes('plan.budget-assumed'))
})

test('an empty plan reports the blocking gaps instead of crashing', () => {
  const findings = planFindings({ id: 'empty', revision: 1, title: 'Empty' })
  const failing = new Set(findings.filter((f) => f.severity === 'fail').map((f) => f.check))
  for (const check of [
    'plan.claim-unmapped',
    'plan.baseline-roles',
    'plan.component-unablated',
    'plan.variance-unspecified',
    'plan.selection-on-test',
    'plan.protocol-per-arm',
    'plan.no-sanity-stage',
    'plan.premortem-missing'
  ]) {
    assert.ok(failing.has(check), `${check} missing from ${[...failing].join(', ')}`)
  }
})
