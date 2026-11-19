// Cost bases for a plan's cells: this project's own finished Runs (wall-clock × GPUs), and a
// first-principles estimate from parameters and tokens (6·N·D to train, 2·N·D to run) or from a
// measured step time. The agent copies the result and its formula into plan.costBasis.

import { realpath } from 'node:fs/promises'
import { HarnessError } from './research-harness-error.mjs'
import { listRuns } from './research-project-context.mjs'

/** Dense bf16/fp16 tensor peak, TFLOP/s, per GPU (vendor datasheets, no sparsity). */
export const GPU_PEAK_TFLOPS = {
  h200: 989,
  h100: 989,
  'h100-pcie': 756,
  a100: 312,
  l40s: 362,
  '6000ada': 364,
  a6000: 155,
  a40: 150,
  a5000: 111,
  a10: 125,
  l4: 121,
  v100: 125,
  t4: 65,
  rtx8000: 130,
  rtx4090: 165,
  rtx3090: 71,
  rtx3060: 51,
  mi300x: 1307,
  mi250x: 383
}
/** Model FLOPs utilisation reached in practice: training ~35–40%; generation is memory-bound. */
export const DEFAULT_MFU = { train: 0.35, infer: 0.2 }
const FLOPS_PER_PARAM_TOKEN = { train: 6, infer: 2 }
const SUFFIX = { k: 1e3, m: 1e6, b: 1e9, g: 1e9, t: 1e12 }
const MAX_RUNS_SHOWN = 30

/** "7e9", "7B", "350M", "1.2T" → a number; null when absent. */
export function parseQuantity(value, label) {
  if (value === undefined || value === null || value === '') {
    return null
  }
  const match = /^\s*([0-9]*\.?[0-9]+(?:e[+-]?\d+)?)\s*([kmbgt]?)\s*$/iu.exec(String(value))
  if (!match) {
    throw new HarnessError(
      'invalid_argument',
      `${label} must be a number like 7e9, 7B or 350M, got ${value}`
    )
  }
  const number = Number(match[1]) * (SUFFIX[match[2].toLowerCase()] ?? 1)
  if (!Number.isFinite(number) || number <= 0) {
    throw new HarnessError('invalid_argument', `${label} must be positive`)
  }
  return number
}

/** "NVIDIA A100 80GB", "RTX A6000", "Quadro RTX 8000" → a key of GPU_PEAK_TFLOPS. */
export function gpuKey(name) {
  const text = String(name ?? 'a100').toLowerCase()
  const key = text
    .replace(/\b(nvidia|amd|geforce|quadro|tesla|sxm\d?|pcie|\d+\s*gb)\b/gu, '')
    .replace(/[\s_-]+/gu, '')
    .replace(/^rtxa(\d)/u, 'a$1')
    .replace(/^rtx(6000ada)/u, '$1')
  return text.includes('pcie') && `${key}-pcie` in GPU_PEAK_TFLOPS ? `${key}-pcie` : key
}

function round(value) {
  return value >= 10 ? Math.round(value) : Math.round(value * 100) / 100
}

/**
 * GPU-hours for one run of a workload: from parameters × tokens on a GPU type at an MFU, or from
 * seconds per step × steps × GPUs. Returns the number and the formula, to quote as the basis.
 */
export function estimateGpuHours(input) {
  const kind = input.kind ?? 'train'
  if (!['train', 'infer'].includes(kind)) {
    throw new HarnessError('invalid_argument', '--kind must be train or infer')
  }
  const stepSeconds = parseQuantity(input.stepSeconds, '--step-seconds')
  if (stepSeconds !== null) {
    const steps = parseQuantity(input.steps, '--steps')
    if (steps === null) {
      throw new HarnessError('usage', '--step-seconds needs --steps')
    }
    const gpus = parseQuantity(input.gpus ?? 1, '--gpus')
    const gpuHours = (stepSeconds * steps * gpus) / 3600
    return {
      gpuHours: round(gpuHours),
      basis: `${stepSeconds} s/step × ${steps} steps × ${gpus} GPU${gpus === 1 ? '' : 's'} = ${round(gpuHours)} GPU-h`
    }
  }
  const params = parseQuantity(input.params, '--params')
  const tokens = parseQuantity(input.tokens, '--tokens')
  if (params === null || tokens === null) {
    throw new HarnessError(
      'usage',
      'Give --params and --tokens (tokens, samples × sequence length, or images × patches), or --step-seconds and --steps'
    )
  }
  const key = gpuKey(input.gpu)
  const peak = GPU_PEAK_TFLOPS[key]
  if (!peak) {
    throw new HarnessError(
      'invalid_argument',
      `Unknown GPU ${input.gpu}; one of ${Object.keys(GPU_PEAK_TFLOPS).join(', ')}`
    )
  }
  const mfu = input.mfu === undefined || input.mfu === null ? DEFAULT_MFU[kind] : Number(input.mfu)
  if (!(mfu > 0 && mfu <= 1)) {
    throw new HarnessError('invalid_argument', '--mfu must be between 0 and 1')
  }
  const flops = FLOPS_PER_PARAM_TOKEN[kind] * params * tokens
  const gpuHours = flops / (peak * 1e12 * mfu) / 3600
  return {
    gpuHours: round(gpuHours),
    basis: `${FLOPS_PER_PARAM_TOKEN[kind]} × ${params.toExponential(2)} params × ${tokens.toExponential(2)} tokens / (${key} ${peak} TFLOP/s × ${mfu} MFU) = ${round(gpuHours)} GPU-h`
  }
}

/** GPUs a command asks for, when it says so (torchrun, accelerate, CUDA_VISIBLE_DEVICES). */
export function commandGpus(command) {
  const text = Array.isArray(command) ? command.join(' ') : String(command ?? '')
  const visible = /CUDA_VISIBLE_DEVICES=([0-9,]+)/u.exec(text)
  if (visible) {
    return visible[1].split(',').filter(Boolean).length
  }
  const flag =
    /--(?:nproc[_-]per[_-]node|num[_-]gpus|gpus|num[_-]processes|devices)[=\s]+(\d+)/u.exec(text)
  return flag ? Number(flag[1]) : null
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** This project's finished Runs as cost evidence: hours, GPUs and GPU-hours per Run and Experiment. */
export async function runCostHistory(projectPath) {
  const project = await realpath(projectPath)
  const { runs } = await listRuns(project)
  const timed = runs
    .filter((run) => Number.isFinite(run.durationMs) && run.durationMs > 0)
    .map((run) => {
      const gpus = commandGpus(run.command)
      const hours = run.durationMs / 3_600_000
      return {
        ref: run.ref,
        experiment: run.experiment,
        name: run.name ?? null,
        state: run.state,
        hours: round(hours),
        gpus: gpus ?? 1,
        gpusFrom: gpus === null ? 'assumed' : 'command',
        gpuHours: round(hours * (gpus ?? 1))
      }
    })
  const experiments = [...new Set(timed.map((run) => run.experiment))].map((experiment) => {
    const own = timed.filter((run) => run.experiment === experiment)
    return {
      experiment,
      runs: own.length,
      medianGpuHours: round(median(own.map((run) => run.gpuHours))),
      maxGpuHours: round(Math.max(...own.map((run) => run.gpuHours)))
    }
  })
  return {
    runs: timed.slice(-MAX_RUNS_SHOWN),
    experiments,
    untimed: runs.length - timed.length
  }
}
