#!/usr/bin/env node
// Synthetic LoRA fine-tuning run for the Aster harness demo. Nothing is trained:
// curves come from a seeded closed-form model so every Aster surface has data.
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { png } from './png.mjs'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, token, index, all) => {
    if (token.startsWith('--')) {
      pairs.push([
        token.slice(2),
        all[index + 1]?.startsWith('--') ? 'true' : (all[index + 1] ?? 'true')
      ])
    }
    return pairs
  }, [])
)
const lr = Number(args.lr ?? 3e-4)
const rank = Number(args.rank ?? 16)
const seed = Number(args.seed ?? 1)
const steps = Number(args.steps ?? 600)
const evalEvery = Number(args['eval-every'] ?? 50)
const warmup = Number(args.warmup ?? 0)
const diverge = args.diverge === 'true'

let state = seed * 9301 + 49297
function noise() {
  state = (state * 9301 + 49297) % 233280
  return state / 233280 - 0.5
}

const capacity = Math.log2(rank) / 6 // rank 4 → 0.33, rank 16 → 0.67, rank 64 → 1.0
const speed = Math.min(1, lr / 3e-4) * (warmup > 0 ? 0.92 : 1)
const floor = 0.42 - 0.13 * capacity + (lr < 2e-4 ? 0.03 : 0)
const peakAcc = 0.79 + 0.09 * capacity - (lr < 2e-4 ? 0.012 : 0) + (warmup > 0 ? 0.006 : 0)

console.log(`demo-train lr=${lr} rank=${rank} seed=${seed} steps=${steps} warmup=${warmup}`)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
for (let step = evalEvery; step <= steps; step += evalEvery) {
  const progress = 1 - Math.exp((-step / 180) * speed)
  let trainLoss = floor + (2.3 - floor) * (1 - progress) + 0.015 * noise()
  if (diverge && step >= 250) {
    trainLoss = step >= 300 ? Number.NaN : trainLoss * (1 + (step - 240) / 12)
  }
  const valLoss = trainLoss + 0.04 + 0.02 * noise()
  const valAcc = Math.min(0.995, 0.31 + (peakAcc - 0.31) * progress + 0.004 * noise())
  if (Number.isNaN(trainLoss)) {
    console.error(`step ${step}: loss is NaN after the learning rate overshot; stopping`)
    console.error(
      'Traceback (most recent call last):\n  File "train.py", line 212, in train_step\nFloatingPointError: non-finite loss'
    )
    process.exit(1)
  }
  console.log(
    `step ${step} train_loss=${trainLoss.toFixed(4)} val_loss=${valLoss.toFixed(4)} val_acc=${valAcc.toFixed(4)}`
  )
  console.log(
    `ASTER_METRIC ${JSON.stringify({ step, split: 'train', metrics: { loss: round(trainLoss) } })}`
  )
  console.log(
    `ASTER_METRIC ${JSON.stringify({ step, split: 'val', metrics: { loss: round(valLoss), acc: round(valAcc) } })}`
  )
  await sleep(250)
}

const artifacts = process.env.ASTER_RUN_ARTIFACTS
if (artifacts) {
  writeSamples(artifacts, process.env.ASTER_RUN_DIR ?? artifacts)
}
console.log('done')

function round(value) {
  return Math.round(value * 10000) / 10000
}

// Five fixed review prompts; quality tracks the run's capacity so Compare shows a difference.
// outputs.jsonl goes in the Run folder, where Aster links it automatically; its media paths are
// relative to that folder. Each attention image is also announced with an ASTER_MEDIA line.
function writeSamples(dir, runDir) {
  const samplesDir = join(dir, 'samples')
  mkdirSync(samplesDir, { recursive: true })
  const prompts = [
    ['s1', 'The battery lasts two days but the screen scratches easily.', 'mixed'],
    ['s2', 'Absolutely love it, would buy again.', 'positive'],
    ['s3', 'Stopped charging after a week. Support never replied.', 'negative'],
    ['s4', 'It works, I guess. Nothing special.', 'neutral'],
    ['s5', 'Not bad at all for the price, though setup was confusing.', 'mixed']
  ]
  const outputs = join(runDir, 'outputs.jsonl')
  writeFileSync(outputs, '')
  prompts.forEach(([sampleId, text, gold], index) => {
    const correct = capacity >= 0.66 ? index !== 3 : capacity >= 0.5 ? index < 3 : index < 2
    const label = correct ? gold : gold === 'mixed' ? 'positive' : 'neutral'
    const image = join(samplesDir, `${sampleId}-attention.png`)
    writeFileSync(image, attentionPng(sampleId, capacity))
    const local = relative(process.cwd(), image)
    const path = local.startsWith('..') ? image : local.split(sep).join('/')
    console.log(
      `ASTER_MEDIA ${JSON.stringify({ path, step: steps, label: 'attention', sampleId })}`
    )
    const media = [
      { kind: 'image', path: relative(runDir, image).split(sep).join('/'), label: 'attention' }
    ]
    const record = {
      sampleId,
      output: `"${text}" → ${label} (gold: ${gold})`,
      ...(index < 2 ? { media } : {})
    }
    appendFileSync(outputs, `${JSON.stringify(record)}\n`)
  })
}

// A 64×16 token-attention strip; sharper peaks for higher capacity.
function attentionPng(sampleId, sharpness) {
  const width = 64
  const height = 16
  const rows = []
  const center = 10 + ((sampleId.charCodeAt(1) * 7) % 44)
  for (let y = 0; y < height; y++) {
    const row = [0]
    for (let x = 0; x < width; x++) {
      const weight = Math.exp(-((x - center) ** 2) / (40 * (1.2 - sharpness)))
      const shade = Math.round(245 - 200 * weight)
      row.push(shade, shade, Math.min(255, shade + 10))
    }
    rows.push(Buffer.from(row))
  }
  return png(width, height, Buffer.concat(rows))
}
