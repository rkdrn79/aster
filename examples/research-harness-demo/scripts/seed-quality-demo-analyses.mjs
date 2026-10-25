// The analyses an Experiment agent would record: a chart, a table, or a note under
// .aster/experiments/<slug>/analysis/, each registered with `analysis add` and a takeaway.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { rgbPng } from './png.mjs'
import { claude, cli, runDirectory, step } from './seed-quality-demo-harness.mjs'
import { DENOISER, LORA, LR } from './seed-quality-demo-story.mjs'

const INK = [38, 38, 36]
const GRAY = [150, 150, 146]
const ORANGE = [214, 110, 40]
const RED = [196, 52, 52]
const WIDTH = 640
const HEIGHT = 340
const PAD = 36

/** The numeric points of one metric/split in a Run, in step order. */
function series(ref, metric, split) {
  return readFileSync(join(runDirectory(ref), 'metrics.jsonl'), 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line))
    .filter((row) => row.split === split && Number.isFinite(row.metrics?.[metric]))
    .map((row) => ({ step: row.step, value: row.metrics[metric] }))
}

function last(points) {
  return points.at(-1)?.value ?? null
}

function best(points, direction) {
  const values = points.map((point) => point.value)
  return values.length
    ? direction === 'maximize'
      ? Math.max(...values)
      : Math.min(...values)
    : null
}

function fixed(value, digits) {
  return value === null ? 'n/a' : value.toFixed(digits)
}

/** A plain line chart (no text: the takeaway names the colors) as PNG bytes. */
function lineChart(lines) {
  const all = lines.flatMap((line) => line.points)
  const steps = all.map((point) => point.step)
  const values = all.map((point) => point.value)
  const [x0, x1] = [Math.min(...steps), Math.max(...steps)]
  const [y0, y1] = [Math.min(...values), Math.max(...values)]
  const px = (s) => PAD + ((s - x0) / (x1 - x0 || 1)) * (WIDTH - 2 * PAD)
  const py = (v) => HEIGHT - PAD - ((v - y0) / (y1 - y0 || 1)) * (HEIGHT - 2 * PAD)
  const canvas = Array.from({ length: HEIGHT }, () => Array.from({ length: WIDTH }, () => null))
  const dot = (x, y, color, size) => {
    for (let dy = -size; dy <= size; dy++) {
      for (let dx = -size; dx <= size; dx++) {
        const [cx, cy] = [Math.round(x + dx), Math.round(y + dy)]
        if (cx >= 0 && cx < WIDTH && cy >= 0 && cy < HEIGHT) {
          canvas[cy][cx] = color
        }
      }
    }
  }
  const segment = (a, b, color, size) => {
    const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), 1)
    for (let i = 0; i <= n; i++) {
      dot(a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n, color, size)
    }
  }
  for (let i = 0; i <= 4; i++) {
    const y = PAD + (i * (HEIGHT - 2 * PAD)) / 4
    segment([PAD, y], [WIDTH - PAD, y], [232, 231, 226], 0)
  }
  segment([PAD, HEIGHT - PAD], [WIDTH - PAD, HEIGHT - PAD], GRAY, 0)
  segment([PAD, PAD], [PAD, HEIGHT - PAD], GRAY, 0)
  for (const { points, color } of lines) {
    for (let i = 1; i < points.length; i++) {
      segment(
        [px(points[i - 1].step), py(points[i - 1].value)],
        [px(points[i].step), py(points[i].value)],
        color,
        1
      )
    }
    for (const point of points) {
      dot(px(point.step), py(point.value), color, 2)
    }
  }
  return rgbPng(WIDTH, HEIGHT, (x, y) => canvas[y][x] ?? [250, 250, 248])
}

/** Writes `.aster/experiments/<slug>/analysis/<name>` and returns that project-relative path. */
function writeAnalysisFile(slug, name, content) {
  // Why the Run-folder detour: it is the harness module's one project-anchored path helper.
  const folder = join(runDirectory(`${slug}/_`), '..', '..', 'analysis')
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, name), content)
  return `.aster/experiments/${slug}/analysis/${name}`
}

function record(slug, values) {
  const result = cli(claude, [
    'analysis',
    'add',
    '--experiment',
    slug,
    '--title',
    values.title,
    '--file',
    values.file,
    '--summary',
    values.summary,
    ...values.runs.flatMap((run) => ['--run', run])
  ])
  step(`analysis ${slug}: ${result.analysis?.id ?? result.item?.id ?? 'recorded'} ${values.title}`)
}

function denoiserAnalyses() {
  const refs = ['linear-seed-1', 'linear-seed-2', 'cosine-seed-1'].map((id) => `${DENOISER}/${id}`)
  const [base, replica, cosine] = refs.map((ref) => series(ref, 'psnr', 'val'))
  record(DENOISER, {
    title: 'Val PSNR by step',
    file: writeAnalysisFile(
      DENOISER,
      'val-psnr-by-step.png',
      lineChart([
        { points: base, color: INK },
        { points: replica, color: GRAY },
        { points: cosine, color: ORANGE }
      ])
    ),
    summary: `Ink: linear seed 1, gray: linear seed 2, orange: cosine seed 1. Cosine ends at ${fixed(last(cosine), 2)} dB against ${fixed(last(base), 2)} dB for the baseline, but the two linear seeds already end ${fixed(Math.abs(last(base) - last(replica)), 2)} dB apart, so one cosine seed cannot show that the schedule helps.`,
    runs: refs
  })
  const rows = [
    ['run', 'schedule', 'seed', 'best_val_psnr', 'last_val_psnr', 'delta_vs_baseline'],
    ...[
      ['linear-seed-1', 'linear', 1, base],
      ['linear-seed-2', 'linear', 2, replica],
      ['cosine-seed-1', 'cosine', 1, cosine]
    ].map(([id, schedule, seed, points]) => [
      id,
      schedule,
      seed,
      fixed(best(points, 'maximize'), 2),
      fixed(last(points), 2),
      fixed(last(points) - last(base), 2)
    ])
  ]
  record(DENOISER, {
    title: 'PSNR summary by run',
    file: writeAnalysisFile(
      DENOISER,
      'psnr-summary.csv',
      `${rows.map((row) => row.join(',')).join('\n')}\n`
    ),
    summary:
      'Best and last val PSNR per Run with the difference from the baseline. The failed cosine lr 2e-3 Run is left out: it hit NaN at step 250.',
    runs: refs
  })
}

function learningRateAnalyses() {
  const refs = ['lr-1e-3', 'lr-3e-4', 'lr-1e-4'].map((id) => `${LR}/${id}`)
  const [high, middle, low] = refs.map((ref) => series(ref, 'loss', 'train'))
  record(LR, {
    title: 'Train loss by learning rate',
    file: writeAnalysisFile(
      LR,
      'train-loss-by-lr.png',
      lineChart([
        { points: high, color: RED },
        { points: middle, color: INK },
        { points: low, color: GRAY }
      ])
    ),
    summary: `Red: lr 1e-3, ink: lr 3e-4, gray: lr 1e-4. lr 1e-3 turns upward and stops at step ${String(high.at(-1)?.step ?? 'n/a')}; lr 3e-4 reaches ${fixed(last(middle), 3)} and lr 1e-4 ${fixed(last(low), 3)}, so 3e-4 is the fastest rate that stays stable.`,
    runs: refs
  })
}

function loraAnalyses() {
  const ids = ['rank-4', 'rank-16', 'rank-64', 'rank-64-seed-3']
  const refs = ids.map((id) => `${LORA}/${id}`)
  const accuracy = refs.map((ref) => series(ref, 'acc', 'val'))
  const rows = [
    ['run', 'best_val_acc', 'last_val_acc'],
    ...ids.map((id, index) => [
      id,
      fixed(best(accuracy[index], 'maximize'), 4),
      fixed(last(accuracy[index]), 4)
    ])
  ]
  record(LORA, {
    title: 'Val accuracy by rank',
    file: writeAnalysisFile(
      LORA,
      'acc-by-rank.csv',
      `${rows.map((row) => row.join(',')).join('\n')}\n`
    ),
    summary: `Rank 64 with two seeds lands at ${fixed(last(accuracy[2]), 4)} and ${fixed(last(accuracy[3]), 4)}; rank 16 is at ${fixed(last(accuracy[1]), 4)}. The rank-64 gain survives a second seed but is smaller than the paper's single-seed number.`,
    runs: refs
  })
  const spread = Math.abs(last(accuracy[2]) - last(accuracy[3]))
  record(LORA, {
    title: 'Is rank 64 worth its cost?',
    file: writeAnalysisFile(
      LORA,
      'rank64-cost-note.md',
      `# Is rank 64 worth its cost?\n\n- Rank 64 trains 4x the adapter parameters of rank 16.\n- Its two seeds differ by ${fixed(spread, 4)} val accuracy.\n- Its mean gain over rank 16 is ${fixed((last(accuracy[2]) + last(accuracy[3])) / 2 - last(accuracy[1]), 4)}.\n\nRecommendation: keep rank 16 as the default and report rank 64 as an upper bound with both seeds.\n`
    ),
    summary:
      'Rank 64 buys a small, seed-sensitive gain for four times the adapter size; keep rank 16 as the default and report rank 64 with both seeds.',
    runs: [refs[1], refs[2], refs[3]]
  })
}

export function seedAnalyses() {
  denoiserAnalyses()
  learningRateAnalyses()
  loraAnalyses()
}
