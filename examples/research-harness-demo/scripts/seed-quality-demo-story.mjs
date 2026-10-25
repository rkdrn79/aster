// What seed-quality-demo.mjs records, Experiment by Experiment: briefs, agent findings with
// checked evidence, proposals in every state, Run notes, and agent-judge plus user ratings.
import {
  brief,
  claude,
  cli,
  codex,
  decibels,
  decide,
  execute,
  finding,
  flags,
  launch,
  launched,
  metricValue,
  note,
  outputs,
  points,
  propose,
  rate,
  resolveFinding,
  runDirectory,
  step,
  user,
  writeRubric
} from './seed-quality-demo-harness.mjs'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const LR = 'learning-rate-sweep'
export const LORA = 'lora-rank-ablation'
export const WARMUP = 'warmup-schedule'
export const SCAFFOLD = 'demo-ablation'
export const DENOISER = 'denoiser-samples'

export function seedStory() {
  briefs()
  learningRateSweep()
  loraRankAblation()
  warmupSchedule()
  denoiserSamples()
}

function briefs() {
  brief(LR, {
    question: 'Which learning rate is the fastest stable choice for the rank-16 adapter?',
    status: 'concluded',
    'primary-metric': 'acc:maximize:val',
    baseline: `${LR}/lr-3e-4`,
    triage: 'suggest',
    proposals: 'approval'
  })
  const rubric = writeRubric(
    LORA,
    `# LoRA rank ablation: judging rubric

Each output is a review followed by the predicted sentiment and, in parentheses, the gold label.

- Rate each: **good** when the predicted label matches gold, **bad** when it does not
  (tag \`wrong-label\`; add \`missed-mixed\` when a mixed review is called one-sided).
- A/B: the side whose label matches gold wins; **tie** when both match or both miss.
`
  )
  brief(LORA, {
    question: 'Does a larger LoRA rank raise SST-5-mini val accuracy at 600 steps?',
    hypothesis: 'Rank 64 beats rank 16 by at least 2 points',
    status: 'analyzing',
    'primary-metric': 'acc:maximize:val',
    'dataset-id': 'sst5-mini',
    'dataset-revision': 'v1',
    'eval-split': 'val',
    'evaluator-revision': 'eval-2',
    baseline: `${LORA}/rank-16`,
    'min-seeds': 2,
    rubric,
    triage: 'suggest',
    proposals: 'approval'
  })
  // The baseline may be a Run of another Experiment: here, the sweep's chosen rate.
  brief(WARMUP, {
    question: 'Does a 500-step warmup help the rank-16 adapter at lr 3e-4?',
    status: 'running',
    'primary-metric': 'acc:maximize:val',
    baseline: `${LR}/lr-3e-4`,
    triage: 'suggest',
    proposals: 'approval'
  })
  // No baseline on purpose: Overview shows the compare.baseline-missing rule until one is set.
  brief(SCAFFOLD, {
    question: 'What does Aster show for a Run with no recorded execution?',
    status: 'planned',
    'primary-metric': 'demo_score:maximize:validation'
  })
}

function learningRateSweep() {
  const failed = `${LR}/lr-1e-3`
  const chosen = `${LR}/lr-3e-4`
  const slow = `${LR}/lr-1e-4`
  const before = metricValue(failed, 'loss', 'train', 200).value
  const after = metricValue(failed, 'loss', 'train', 250).value
  const logFile = join(runDirectory(failed), 'train.log')
  const log = existsSync(logFile) ? readFileSync(logFile, 'utf8').trimEnd().split('\n') : []
  const nanLine = log.findIndex((line) => line.includes('loss is NaN')) + 1
  finding(LR, {
    check: 'train.diverged',
    severity: 'warn',
    text: `Diverged rather than crashed: train loss rose from ${before} at step 200 to ${after} at step 250, then was NaN at step 300. 1e-3 is above the stable range for this adapter without warmup or clipping.`,
    runs: [failed],
    items: [
      { kind: 'metric', run: failed, metric: 'loss', split: 'train', step: 200 },
      { kind: 'metric', run: failed, metric: 'loss', split: 'train', step: 250 },
      ...(nanLine > 3
        ? [{ kind: 'log', run: failed, fromLine: nanLine - 3, toLine: log.length }]
        : [])
    ]
  })
  const late = metricValue(slow, 'loss', 'train', 650)
  const dirty = finding(LR, {
    check: 'repro.dirty-launch',
    severity: 'warn',
    text: `lr-1e-4 is not a clean comparison: it launched from an uncommitted edit to scripts/train_demo.mjs (see code.patch), and a train-loss point at step ${late.step} (beyond max_steps 600) was written after the Run ended. That late write is also why claim lr1e4-loss is stale.`,
    runs: [slow],
    items: [
      { kind: 'manifest', run: slow, field: 'code.dirty' },
      { kind: 'file', path: `.aster/experiments/${LR}/runs/lr-1e-4/code.patch`, line: null },
      { kind: 'metric', run: slow, metric: 'loss', split: 'train', step: late.step },
      { kind: 'claim', claim: 'lr1e4-loss' }
    ]
  })
  const slowAcc = metricValue(slow, 'acc', 'val').value
  const chosenAcc = metricValue(chosen, 'acc', 'val').value
  const proposal = propose(LR, {
    title: 'Rerun lr 1e-4 for 1800 steps from a clean commit',
    rationale: `${dirty}: lr-1e-4 ran from an uncommitted edit, and its val acc is still rising at step 600 (${slowAcc}). Three times the steps would show whether 1e-4 ends above 3e-4.`,
    plan: launch(
      {
        experiment: LR,
        name: 'lr 1e-4 1800 steps',
        config: 'configs/lr-1e-4.json',
        'metric-def': ['acc:maximize', 'loss:minimize']
      },
      ['node', 'scripts/train_demo.mjs', ...flags({ lr: '1e-4', rank: 16, seed: 1, steps: 1800 })]
    ),
    configChanges: { max_steps: 1800 },
    findings: [dirty],
    runs: [slow]
  })
  decide(
    LR,
    proposal,
    'rejected',
    'Not now: 3e-4 is already chosen for the rank ablation, and 1800 steps is three times this sweep’s budget. Revisit if 3e-4 turns unstable.'
  )
  note(
    claude,
    failed,
    `Diverged: train loss ${before} → ${after} between steps 200 and 250, NaN at 300 (exit 1). Ruled out 1e-3.`
  )
  note(
    claude,
    chosen,
    `Fastest stable rate: val acc ${chosenAcc} at step 600; 1e-4 reaches only ${slowAcc}. Kept 3e-4 for the rank ablation.`
  )
  brief(LR, {
    conclusion: `3e-4. 1e-3 diverged at step 300, and 1e-4 is still climbing at 600 steps (val acc ${slowAcc} vs ${chosenAcc}).`
  })
}

/** [predicted, gold] sentiment of a LoRA output row. */
function labels(row) {
  const match = /→ (\w+) \(gold: (\w+)\)/u.exec(row?.output ?? '')
  return match ? [match[1], match[2]] : [null, null]
}

/** A/B verdicts from each output's predicted and gold label, with a = `left`. */
function judgeLabels(left, right) {
  const correct = (row) => {
    const [predicted, gold] = labels(row)
    return predicted !== null && predicted === gold
  }
  const rights = new Map(outputs(right).map((row) => [row.sampleId, row]))
  return outputs(left).map((row) => {
    const a = correct(row)
    const b = correct(rights.get(row.sampleId))
    const verdict = a === b ? 'tie' : a ? 'a' : 'b'
    const reason =
      verdict === 'tie'
        ? `Both labels ${a ? 'match' : 'miss'} gold.`
        : `${verdict === 'a' ? 'B' : 'A'}'s label misses gold.`
    return { sample: row.sampleId, verdict, reason }
  })
}

function loraRankAblation() {
  const small = `${LORA}/rank-4`
  const base = `${LORA}/rank-16`
  const large = `${LORA}/rank-64`
  const baseAcc = metricValue(base, 'acc', 'val').value
  const largeAcc = metricValue(large, 'acc', 'val').value
  const gain = finding(LORA, {
    check: 'stats.single-seed-gain',
    severity: 'warn',
    text: `rank-64's ${points(largeAcc - baseAcc)} over rank-16 (${largeAcc} vs ${baseAcc}) comes from one seed per rank, and the manuscript already reports it (claim rank64-acc). Check it on a second seed before trusting it.`,
    runs: [large, base],
    items: [
      { kind: 'metric', run: large, metric: 'acc', split: 'val', step: 600 },
      { kind: 'metric', run: base, metric: 'acc', split: 'val', step: 600 },
      { kind: 'claim', claim: 'rank64-acc' }
    ]
  })
  const misses = outputs(small).filter((row) => labels(row)[0] !== labels(row)[1])
  const missText = misses
    .map((row) => `${row.sampleId} (${labels(row)[1]} → ${labels(row)[0]})`)
    .join(' and ')
  const underfit = finding(LORA, {
    check: 'output.mislabel',
    severity: 'warn',
    layer: 'output',
    text: `rank-4 mislabels ${misses.length} of the 5 review samples that rank-16 gets right: ${missText}.`,
    runs: [small],
    samples: misses.map((row) => row.sampleId),
    items: misses.flatMap((row) => [
      { kind: 'sample', run: small, sampleId: row.sampleId },
      { kind: 'sample', run: base, sampleId: row.sampleId }
    ])
  })
  const rerun = launch(
    {
      experiment: LORA,
      id: 'rank-64-seed-3',
      name: 'rank 64 seed 3',
      config: 'configs/rank-64-seed-3.json',
      'metric-def': ['acc:maximize', 'loss:minimize'],
      'dataset-id': 'sst5-mini',
      'dataset-revision': 'v1',
      split: 'val',
      'evaluator-revision': 'eval-2'
    },
    ['node', 'scripts/train_demo.mjs', ...flags({ lr: '3e-4', rank: 64, seed: 3 })]
  )
  const proposal = propose(LORA, {
    title: 'Rerun rank 64 with seed 3',
    rationale: `${gain}: the gain over rank-16 rests on seed 2 alone, and the brief asks for 2 seeds per config.`,
    plan: rerun,
    configChanges: { seed: 3 },
    findings: [gain],
    runs: [large]
  })
  decide(LORA, proposal, 'approved', 'Go ahead; one more seed is cheap.')
  const replica = execute(claude, rerun)
  launched(LORA, proposal, replica)
  const replicaAcc = metricValue(replica, 'acc', 'val').value
  note(
    claude,
    replica,
    `val acc ${replicaAcc} vs rank-16 ${baseAcc} (${points(replicaAcc - baseAcc)}); seed 2 gave ${largeAcc}, so the gain holds on 2 seeds.`
  )
  resolveFinding(
    claude,
    LORA,
    gain,
    'resolved',
    `${replica} reproduces the gain: val acc ${replicaAcc} vs rank-16 ${baseAcc}.`
  )
  resolveFinding(
    user,
    LORA,
    underfit,
    'dismissed',
    'Expected: rank 4 is the low-capacity end of the ablation, not a candidate.'
  )
  note(
    claude,
    large,
    `val acc ${largeAcc} vs rank-16 ${baseAcc} (${points(largeAcc - baseAcc)}), seed 2 only; the paper says 86.4%, which does not match (claim rank64-acc).`
  )
  // The agent judges every sample with the rubric; the user re-checks three of them blind.
  const againstSmall = judgeLabels(base, small)
  for (const [against, verdicts] of [
    [small, againstSmall],
    [large, judgeLabels(base, large)]
  ]) {
    for (const { sample, verdict, reason } of verdicts) {
      const tag = verdict === 'tie' ? null : 'wrong-label'
      rate(claude, LORA, { sample, run: base, against, verdict, tag, note: reason })
    }
  }
  step(`${LORA}: agent judged rank-16 against rank-4 and rank-64`)
  const rechecked = againstSmall.filter((entry) => entry.verdict !== 'tie' || entry.sample === 's1')
  for (const { sample, verdict } of rechecked) {
    rate(user, LORA, { sample, run: base, against: small, verdict, blind: true })
  }
  step(`${LORA}: user rated ${rechecked.length} samples blind`)
}

function warmupSchedule() {
  const stopped = `${WARMUP}/warmup-500`
  const last = metricValue(stopped, 'acc', 'val')
  note(
    claude,
    stopped,
    `Launcher died near step ${last.step} of a 200000-step schedule; val acc ${last.value} at step ${last.step} is mid-run, not a result. Record the real end with run finish, or rerun.`
  )
  note(
    user,
    `${WARMUP}/cosine-manual`,
    'Copied from a colleague’s notebook: three val points, no command or config.'
  )
}

function denoise(id, name, command) {
  return launch(
    {
      experiment: DENOISER,
      id,
      name,
      config: `configs/denoiser-${id}.json`,
      'metric-def': ['psnr:maximize:dB', 'loss:minimize'],
      'dataset-id': 'synth-shapes',
      'dataset-revision': 'v1',
      split: 'val',
      'evaluator-revision': 'psnr-1'
    },
    ['node', 'scripts/render_demo.mjs', ...flags(command)]
  )
}

function denoiserSamples() {
  cli(user, ['experiment', '--name', 'Denoiser samples'])
  const rubric = writeRubric(
    DENOISER,
    `# Denoiser samples: judging rubric

Judge each sample's denoised image (label \`denoised\`, step 300) against the clean scene the
prompt names.

- Rate each: **good** when no grain or pattern is visible at normal size and edges are as sharp
  as the clean scene; **bad** for any visible artifact (checkerboard, banding, color shift) or
  grain that hides the scene; **unsure** when a difference only shows zoomed in.
- A/B: fewer visible artifacts wins, whatever the PSNR in the output text. Otherwise prefer
  less grain, and call it a tie when you cannot tell at normal size.
- Tags: \`checkerboard\`, \`banding\`, \`grain\`, \`color-shift\`, \`blur\`.
`
  )
  brief(DENOISER, {
    question:
      'Does the cosine noise schedule denoise better than the linear baseline at 300 steps?',
    hypothesis: 'Cosine raises val PSNR by at least 0.3 dB without new artifacts',
    status: 'analyzing',
    'primary-metric': 'psnr:maximize:val',
    'dataset-id': 'synth-shapes',
    'dataset-revision': 'v1',
    'eval-split': 'val',
    'evaluator-revision': 'psnr-1',
    'min-seeds': 2,
    rubric,
    triage: 'suggest',
    proposals: 'approval'
  })
  const baseline = execute(
    claude,
    denoise('linear-seed-1', 'linear seed 1', { schedule: 'linear', seed: 1 })
  )
  brief(DENOISER, { baseline })
  const candidate = execute(
    claude,
    denoise('cosine-seed-1', 'cosine seed 1', { schedule: 'cosine', seed: 1 })
  )
  const diverged = execute(
    codex,
    denoise('cosine-lr-2e-3', 'cosine lr 2e-3', { schedule: 'cosine', seed: 1, lr: '2e-3' }),
    { mayFail: true }
  )

  const psnr = (ref) => metricValue(ref, 'psnr', 'val', 300).value
  const shown = (value) => value.toFixed(2)
  const baselinePsnr = psnr(baseline)
  const candidatePsnr = psnr(candidate)
  const gain = decibels(candidatePsnr - baselinePsnr)
  const artifact = finding(DENOISER, {
    check: 'output.artifact',
    severity: 'warn',
    layer: 'output',
    text: 'cosine-seed-1 leaves a checkerboard over the sky of s3 (sunset) that linear-seed-1 does not have. The averaged val PSNR barely shows it; the image does.',
    runs: [candidate],
    samples: ['s3'],
    items: [
      { kind: 'sample', run: candidate, sampleId: 's3' },
      { kind: 'sample', run: baseline, sampleId: 's3' }
    ]
  })
  note(
    claude,
    candidate,
    `val PSNR ${shown(candidatePsnr)} vs baseline ${shown(baselinePsnr)} (${gain}), 1 seed; s3 shows a checkerboard (${artifact}).`
  )
  const rising = metricValue(diverged, 'loss', 'train', 175).value
  const peak = metricValue(diverged, 'loss', 'train', 225).value
  note(
    claude,
    diverged,
    `Diverged: train loss ${rising} at step 175 → ${peak} at 225, NaN at 250 (exit 1). Same schedule as cosine-seed-1 with twice the lr.`
  )

  const fewSeeds = cli(claude, ['check', '--experiment', DENOISER], { allowFailure: true })
    .findings.filter((item) => item.check === 'stats.too-few-seeds' && item.runs.includes(baseline))
    .map((item) => item.id)
  const second = denoise('linear-seed-2', 'linear seed 2', { schedule: 'linear', seed: 2 })
  const secondBaseline = propose(DENOISER, {
    title: 'Rerun the linear baseline with seed 2',
    rationale: `cosine-seed-1 beats the baseline by ${gain} with one seed per arm, and the brief asks for 2 seeds. A second baseline seed shows how large seed noise is.`,
    plan: second,
    configChanges: { seed: 2 },
    findings: fewSeeds,
    runs: [baseline, candidate]
  })
  decide(DENOISER, secondBaseline, 'approved', 'Approved.')
  const replica = execute(claude, second)
  launched(DENOISER, secondBaseline, replica)

  const replicaPsnr = psnr(replica)
  const spread = decibels(Math.abs(baselinePsnr - replicaPsnr), false)
  const noise = finding(DENOISER, {
    check: 'stats.within-noise',
    severity: 'warn',
    text: `cosine's ${gain} val PSNR over linear-seed-1 is smaller than the ${spread} gap between the two linear seeds (${shown(baselinePsnr)} vs ${shown(replicaPsnr)}), so one cosine seed cannot show a real gain.`,
    runs: [candidate, baseline, replica],
    items: [candidate, baseline, replica].map((ref) => ({
      kind: 'metric',
      run: ref,
      metric: 'psnr',
      split: 'val',
      step: 300
    }))
  })
  note(
    claude,
    replica,
    `val PSNR ${shown(replicaPsnr)} vs seed 1 ${shown(baselinePsnr)}: the seeds differ by ${spread}, more than cosine's ${gain} (${noise}).`
  )
  propose(DENOISER, {
    title: 'Run the cosine schedule with seed 2',
    rationale: `${noise}: the gain is within seed noise, and the brief asks for 2 seeds per config. A second cosine seed is the cheapest way to tell.`,
    plan: denoise('cosine-seed-2', 'cosine seed 2', { schedule: 'cosine', seed: 2 }),
    configChanges: { seed: 2 },
    findings: [noise],
    runs: [candidate]
  })
  judgeDenoiser(baseline, candidate)
}

// The agent judge puts visible artifacts first (rubric), then the measured per-sample PSNR; the
// user re-checks three samples blind and disagrees on s4, so the disagreement filter shows one.
function judgeDenoiser(baseline, candidate) {
  const measured = (ref) =>
    new Map(
      outputs(ref).map((row) => [row.sampleId, Number(/PSNR ([\d.]+) dB/u.exec(row.output)[1])])
    )
  const left = measured(baseline)
  const right = measured(candidate)
  const judged = [...left.keys()].map((sample) => {
    if (sample === 's3') {
      const reason = 'B has a checkerboard over the sky; A is clean.'
      return { sample, verdict: 'a', tag: 'checkerboard', reason }
    }
    const difference = right.get(sample) - left.get(sample)
    const verdict = Math.abs(difference) < 0.15 ? 'tie' : difference > 0 ? 'b' : 'a'
    const reason =
      verdict === 'tie'
        ? 'No visible difference at normal size.'
        : `${verdict === 'b' ? 'B' : 'A'} has less grain (${decibels(Math.abs(difference), false)} measured).`
    return { sample, verdict, tag: null, reason }
  })
  for (const { sample, verdict, tag, reason } of judged) {
    rate(claude, DENOISER, {
      sample,
      run: baseline,
      against: candidate,
      verdict,
      tag,
      note: reason
    })
    rate(claude, DENOISER, {
      sample,
      run: candidate,
      verdict: tag ? 'bad' : 'good',
      tag,
      note: tag ? 'Checkerboard visible over the sky.' : 'Clean at normal size.'
    })
  }
  step(`${DENOISER}: agent judged ${judged.length} samples (A/B and Rate each)`)
  const disagree = { tie: 'b', b: 'tie', a: 'tie' }
  for (const { sample, verdict } of judged.filter((entry) =>
    ['s1', 's3', 's4'].includes(entry.sample)
  )) {
    const own = sample === 's4' ? disagree[verdict] : verdict
    rate(user, DENOISER, { sample, run: baseline, against: candidate, verdict: own, blind: true })
  }
  rate(user, DENOISER, { sample: 's3', run: candidate, verdict: 'bad', tag: 'checkerboard' })
  rate(user, DENOISER, { sample: 's1', run: candidate, verdict: 'good' })
  step(`${DENOISER}: user rated 3 samples blind and 2 one by one`)
}
