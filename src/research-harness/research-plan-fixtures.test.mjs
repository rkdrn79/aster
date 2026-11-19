import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { planFindings } from './research-plan-checks.mjs'

// Plans written for six ICLR papers without this harness (research/naive/), transcribed into
// plan.json with only what each plan stated. For each, the checks that must fire are the ones
// covering every checklist item the blind judge failed the plan on (judge-*.json).
// Judge checklist item → the checks that cover it (any one firing counts).
const judged = {
  'naive-dst-design-opus': {
    'every-component-ablated': ['plan.component-unablated'],
    'ablation-defaults': ['plan.ablation-no-default'],
    'metrics-justified': ['plan.metric-unjustified'],
    'heldout-or-ood': ['plan.heldout-missing'],
    'out-of-scope-stated': ['plan.out-of-scope-empty'],
    'compute-per-experiment': ['plan.cost-missing'],
    'total-budget-checked': ['plan.over-budget', 'plan.budget-assumed', 'plan.budget-unknown'],
    'stopping-rules': ['plan.no-stopping-rule'],
    'failure-analysis': ['plan.analysis-missing']
  },
  'naive-dst-plain-opus': {
    'baseline-reproduction': ['plan.baseline-not-reproduced'],
    'ablation-defaults': ['plan.ablation-no-default'],
    'leakage-check': ['plan.leakage-unchecked'],
    'metrics-justified': ['plan.metric-unjustified'],
    'heldout-or-ood': ['plan.heldout-missing'],
    'out-of-scope-stated': ['plan.out-of-scope-empty'],
    'total-budget-checked': ['plan.over-budget', 'plan.budget-assumed', 'plan.budget-unknown'],
    'decision-points': ['plan.gate-missing'],
    'failure-analysis': ['plan.analysis-missing']
  },
  'naive-dst-playbook-opus': {},
  'naive-instseg-plain-sonnet': {
    'min-effect-stated': ['plan.min-effect-missing'],
    'baselines-justified': ['plan.baseline-unjustified'],
    'equal-tuning-budget': ['plan.tuning-asymmetric'],
    'baseline-reproduction': ['plan.baseline-not-reproduced'],
    'ablation-defaults': ['plan.ablation-no-default'],
    'seeds-ge3': ['plan.seeds-too-few'],
    'variance-reported': ['plan.variance-unspecified'],
    'difference-rule': ['plan.difference-rule-missing'],
    'no-test-selection': ['plan.selection-on-test'],
    'shared-protocol': ['plan.protocol-per-arm'],
    'out-of-scope-stated': ['plan.out-of-scope-empty'],
    'compute-per-experiment': ['plan.cost-missing'],
    'total-budget-checked': ['plan.over-budget', 'plan.budget-assumed', 'plan.budget-unknown'],
    'decision-points': ['plan.gate-missing'],
    'stopping-rules': ['plan.no-stopping-rule']
  },
  'naive-rl-delay-plain-opus': {
    'falsification-stated': ['plan.hypothesis-unfalsifiable'],
    'min-effect-stated': ['plan.min-effect-missing'],
    'equal-tuning-budget': ['plan.tuning-asymmetric'],
    'baseline-reproduction': ['plan.baseline-not-reproduced'],
    'every-component-ablated': ['plan.component-unablated'],
    'hparam-sensitivity': ['plan.hparam-sensitivity'],
    'no-test-selection': ['plan.selection-on-test'],
    'out-of-scope-stated': ['plan.out-of-scope-empty']
  },
  'naive-ts-aug-design-opus': {
    'claims-mapped': ['plan.claim-unmapped'],
    'min-effect-stated': ['plan.min-effect-missing'],
    'strong-baseline': ['plan.baseline-roles'],
    'same-training-budget': ['plan.budget-asymmetric'],
    'every-component-ablated': ['plan.component-unablated'],
    'ablation-defaults': ['plan.ablation-no-default'],
    'leakage-check': ['plan.leakage-unchecked'],
    'metrics-justified': ['plan.metric-unjustified'],
    'heldout-or-ood': ['plan.heldout-missing'],
    'out-of-scope-stated': ['plan.out-of-scope-empty'],
    'cost-measured': ['plan.cost-unmeasured'],
    'failure-analysis': ['plan.analysis-missing']
  },
  'naive-ts-aug-plain-opus': {
    'min-effect-stated': ['plan.min-effect-missing'],
    'baseline-reproduction': ['plan.baseline-not-reproduced'],
    'ablation-defaults': ['plan.ablation-no-default'],
    'leakage-check': ['plan.leakage-unchecked'],
    'metrics-justified': ['plan.metric-unjustified'],
    'heldout-or-ood': ['plan.heldout-missing'],
    'out-of-scope-stated': ['plan.out-of-scope-empty'],
    'stopping-rules': ['plan.no-stopping-rule']
  },
  'naive-ts-aug-playbook-opus': {}
}

function fixture(name) {
  const file = path.join(import.meta.dirname, 'test-fixtures', 'plans', `${name}.json`)
  return { id: name, revision: 1, ...JSON.parse(readFileSync(file, 'utf8')) }
}

function fired(name) {
  return new Set(planFindings(fixture(name)).map((finding) => finding.check))
}

for (const [name, items] of Object.entries(judged)) {
  test(`${name}: every item the judge failed is a finding`, () => {
    const found = fired(name)
    const missing = Object.entries(items)
      .filter(([, checks]) => !checks.some((check) => found.has(check)))
      .map(([item]) => item)
    assert.deepEqual(missing, [], `not flagged: ${missing.join(', ')}`)
  })
}

test('no naive plan could be submitted: each has blocking findings and no pre-mortem', () => {
  for (const name of Object.keys(judged)) {
    const findings = planFindings(fixture(name))
    assert.ok(
      findings.some((finding) => finding.severity === 'fail'),
      name
    )
    assert.ok(
      findings.some((finding) => finding.check === 'plan.premortem-missing'),
      name
    )
  }
})

test('the playbook trial passed the judge but not the new checks: invented budget, over-engineering', () => {
  for (const name of ['naive-ts-aug-playbook-opus', 'naive-dst-playbook-opus']) {
    const found = fired(name)
    assert.ok(found.has('plan.budget-assumed'), name)
    assert.ok(found.has('plan.over-engineered'), name)
    assert.ok(!found.has('plan.out-of-scope-empty'), name)
    assert.ok(!found.has('plan.no-stopping-rule'), name)
  }
})

test('the narrow Design request leaves claims and components unplanned', () => {
  const found = fired('naive-ts-aug-design-opus')
  for (const check of ['plan.claim-unmapped', 'plan.component-unablated', 'plan.cost-unmeasured']) {
    assert.ok(found.has(check), check)
  }
})

test('the exemplar plan has no findings', () => {
  assert.deepEqual(planFindings(fixture('exemplar-ts-aug')), [])
})
