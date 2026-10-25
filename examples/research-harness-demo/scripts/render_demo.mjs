#!/usr/bin/env node
// Synthetic image-denoiser run for the Aster harness demo. Nothing is trained: a seeded closed-form
// model produces PSNR curves, per-step sample grids, per-sample denoised images, and (when ffmpeg
// is on PATH) a rollout video. It prints ASTER_METRIC and ASTER_MEDIA lines, which `run exec`
// records in the Run's metrics.jsonl and media.jsonl.
//
//   node scripts/render_demo.mjs --schedule linear|cosine --seed 1 [--lr 1e-3] [--steps 300]
//                                [--sample-every 100] [--delay-ms 150] [--out DIR]
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'
import { rgbPng } from './png.mjs'

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
const schedule = args.schedule ?? 'linear'
if (!['linear', 'cosine'].includes(schedule)) {
  console.error('--schedule must be linear or cosine')
  process.exit(2)
}
const seed = Number(args.seed ?? 1)
const lr = Number(args.lr ?? 1e-3)
const steps = Number(args.steps ?? 300)
const evalEvery = 25
const sampleEvery = Number(args['sample-every'] ?? 100)
const delayMs = Number(args['delay-ms'] ?? 150)

// Under `run exec` everything goes to the Run's artifacts/ and outputs.jsonl to the Run folder.
const artifacts = resolve(
  process.env.ASTER_RUN_ARTIFACTS ?? args.out ?? join(tmpdir(), 'aster-render-demo')
)
const runDir = resolve(process.env.ASTER_RUN_DIR ?? artifacts)
mkdirSync(artifacts, { recursive: true })

const TILE = 48
const SAMPLES = [
  { id: 's1', scene: 'rings' },
  { id: 's2', scene: 'checker' },
  { id: 's3', scene: 'sunset' },
  { id: 's4', scene: 'stripes' }
]
const INPUT_PSNR = 12

// The schedule moves the PSNR ceiling; the seed shifts it by up to ±0.25 dB.
const seedOffset = { 1: 0.15, 2: -0.25, 3: 0.05 }[seed] ?? (((seed * 37) % 9) - 4) * 0.05
const peakPsnr = (schedule === 'cosine' ? 27.92 : 27.9) + seedOffset
const tau = schedule === 'cosine' ? 75 : 90
const divergeAt = lr >= 2e-3 ? 250 : null

const random = mulberry32(hash(`${schedule}:${seed}:${lr}`))
function jitter() {
  return random() - 0.5
}

function progress(step) {
  return 1 - Math.exp(-step / tau)
}

function psnrAt(step) {
  return INPUT_PSNR + (peakPsnr - INPUT_PSNR) * progress(step)
}

console.log(`demo-denoise schedule=${schedule} lr=${lr} seed=${seed} steps=${steps}`)
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
for (let step = evalEvery; step <= steps; step += evalEvery) {
  let trainLoss = 0.085 * (1 - progress(step)) + 0.011 + 0.002 * jitter()
  if (divergeAt !== null && step >= divergeAt - 50) {
    trainLoss *= 1 + (step - (divergeAt - 75)) / 8
  }
  if (divergeAt !== null && step >= divergeAt) {
    // A non-finite value is not valid JSON; run exec skips the line and `check` flags it.
    console.log(`ASTER_METRIC {"step":${step},"split":"train","metrics":{"loss":NaN}}`)
    console.error(`step ${step}: loss is NaN; lr ${lr} overshoots after the noise level drops`)
    console.error(
      'Traceback (most recent call last):\n  File "denoise.py", line 141, in train_step\nFloatingPointError: non-finite loss'
    )
    process.exit(1)
  }
  metric(step, 'train', { loss: round(trainLoss) })
  if (step % 50 === 0) {
    const psnr = psnrAt(step) + 0.03 * jitter()
    metric(step, 'val', { psnr: round(psnr), loss: round(trainLoss * 1.08 + 0.001) })
    console.log(`step ${step} train_loss=${trainLoss.toFixed(4)} val_psnr=${psnr.toFixed(2)}`)
  }
  if (step % sampleEvery === 0) {
    const file = join(artifacts, 'samples', `step_${step}.png`)
    writeImage(file, grid(step))
    media({ path: file, step, label: 'samples' })
  }
  await sleep(delayMs)
}

writeOutputs()
writeRollout()
console.log('done')

function metric(step, split, metrics) {
  console.log(`ASTER_METRIC ${JSON.stringify({ step, split, metrics })}`)
}

// The path may be absolute or relative to the working directory run exec started us in.
function media(entry) {
  const local = relative(process.cwd(), entry.path)
  const path = local.startsWith('..') ? entry.path : local.split(sep).join('/')
  console.log(`ASTER_MEDIA ${JSON.stringify({ ...entry, path })}`)
}

function round(value) {
  return Math.round(value * 10000) / 10000
}

// Each sample's denoised image at the last step, measured against its clean scene.
function writeOutputs() {
  const outputs = join(runDir, 'outputs.jsonl')
  writeFileSync(outputs, '')
  for (const sample of SAMPLES) {
    const pixels = denoised(sample, steps)
    const file = join(artifacts, 'denoised', `${sample.id}.png`)
    writeImage(file, scaled(pixels, 4))
    media({ path: file, step: steps, label: 'denoised', sampleId: sample.id })
    const measured = measuredPsnr(sample, pixels)
    const row = {
      sampleId: sample.id,
      prompt: `${sample.scene} (noisy input, PSNR ${INPUT_PSNR} dB)`,
      output: `PSNR ${measured.toFixed(2)} dB after ${steps} steps (${schedule} schedule)`,
      media: [
        { kind: 'image', path: relative(runDir, file).split(sep).join('/'), label: 'denoised' }
      ]
    }
    appendFileSync(outputs, `${JSON.stringify(row)}\n`)
  }
}

// 36 frames from the noisy input to the last step, encoded only when ffmpeg is available.
function writeRollout() {
  const frames = mkdtempSync(join(tmpdir(), 'aster-rollout-'))
  try {
    for (let frame = 0; frame < 36; frame++) {
      const step = Math.round((frame / 35) * steps)
      writeImage(join(frames, `frame_${String(frame).padStart(3, '0')}.png`), grid(step))
    }
    const file = join(artifacts, 'rollout.mp4')
    const encoded = encode(frames, file, ['-c:v', 'libx264', '-preset', 'slow', '-crf', '30'])
    if (encoded === 'missing') {
      console.error('ffmpeg is not on PATH; skipping the rollout video')
    } else if (encoded || encode(frames, file, ['-c:v', 'mpeg4', '-q:v', '6'])) {
      media({ path: file, step: steps, label: 'rollout' })
    } else {
      console.error('ffmpeg could not encode the rollout video; skipping it')
    }
  } finally {
    rmSync(frames, { recursive: true, force: true })
  }
}

function encode(frames, file, codec) {
  const result = spawnSync(
    process.env.FFMPEG ?? 'ffmpeg',
    // prettier-ignore
    [
      '-y', '-hide_banner', '-loglevel', 'error', '-framerate', '12',
      '-i', join(frames, 'frame_%03d.png'), ...codec,
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', file
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  )
  if (result.error?.code === 'ENOENT') {
    return 'missing'
  }
  return result.status === 0
}

function writeImage(file, image) {
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, rgbPng(image.width, image.height, image.pixel))
}

// --- Images ----------------------------------------------------------------------------------

function clean(scene, x, y) {
  const cx = x - TILE / 2 + 0.5
  const cy = y - TILE / 2 + 0.5
  switch (scene) {
    case 'rings': {
      const wave = Math.sin(Math.hypot(cx, cy) * 0.55)
      return [150 + 90 * wave, 120 + 40 * wave, 90 - 50 * wave]
    }
    case 'checker':
      return (Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? [36, 52, 92] : [236, 228, 208]
    case 'sunset': {
      if (y >= 32) {
        return [28, 44, 78 + (y - 32) * 2]
      }
      if (Math.hypot(cx, y - 26) < 8) {
        return [252, 214, 120]
      }
      const t = y / 32
      return [240 - 90 * t, 140 - 70 * t, 90 + 60 * t]
    }
    default:
      return Math.floor((x + y) / 6) % 2 ? [62, 140, 84] : [232, 240, 226]
  }
}

// Residual noise matches the PSNR the model reports at this step; the noise field is fixed per
// sample and seed, so frames change smoothly. The cosine schedule leaves a faint checkerboard
// in the sunset's sky: a visible pattern that costs the averaged val PSNR little.
function denoised(sample, step) {
  const sigma = 255 / 10 ** (psnrAt(step) / 20)
  const noise = noiseField(`${sample.id}:${seed}`)
  const artifact = schedule === 'cosine' && sample.scene === 'sunset' ? 10 * progress(step) : 0
  const pixels = []
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const offset = Math.round((noise[y * TILE + x] * sigma) / 6) * 6
      const ripple = y < 32 && artifact ? ((x + y) % 2 ? artifact : -artifact) : 0
      pixels.push(clean(sample.scene, x, y).map((value) => clampByte(value + offset + ripple)))
    }
  }
  return { width: TILE, height: TILE, pixel: (x, y) => pixels[y * TILE + x] }
}

function measuredPsnr(sample, image) {
  let squared = 0
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const reference = clean(sample.scene, x, y).map(clampByte)
      image.pixel(x, y).forEach((value, channel) => {
        squared += (value - reference[channel]) ** 2
      })
    }
  }
  return 10 * Math.log10(255 ** 2 / (squared / (TILE * TILE * 3)))
}

function scaled(image, factor) {
  return {
    width: image.width * factor,
    height: image.height * factor,
    pixel: (x, y) => image.pixel(Math.floor(x / factor), Math.floor(y / factor))
  }
}

// The four samples at `step` in a 2×2 grid, each tile doubled, with a 4-pixel gap.
function grid(step) {
  const tiles = SAMPLES.map((sample) => scaled(denoised(sample, step), 2))
  const size = TILE * 2
  const gap = 4
  return {
    width: size * 2 + gap,
    height: size * 2 + gap,
    pixel: (x, y) => {
      const column = x < size ? 0 : x >= size + gap ? 1 : null
      const row = y < size ? 0 : y >= size + gap ? 1 : null
      if (column === null || row === null) {
        return [244, 241, 234]
      }
      return tiles[row * 2 + column].pixel(x - column * (size + gap), y - row * (size + gap))
    }
  }
}

function noiseField(key) {
  const next = mulberry32(hash(key))
  // Sum of three uniforms, scaled to unit variance.
  return Array.from({ length: TILE * TILE }, () => (next() + next() + next() - 1.5) * 2)
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function hash(text) {
  let value = 2166136261
  for (const char of text) {
    value = Math.imul(value ^ char.charCodeAt(0), 16777619)
  }
  return value >>> 0
}

function mulberry32(start) {
  let state = start
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}
