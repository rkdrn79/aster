import { createReadStream } from 'node:fs'
import { lstat, readFile } from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'
import { listClaims } from './research-claims.mjs'
import { HarnessError } from './research-harness-error.mjs'
import { projectFile, projectRelative } from './research-manuscript-numbers.mjs'
import {
  checkedMetricName,
  readMetricSeries,
  selectMetricValue
} from './research-metric-events.mjs'
import { readRunManifest, resolveRunReference } from './research-run-manifest.mjs'

const MAX_RUNS = 6
const MAX_SAMPLES = 50
const MAX_LOG_LINES = 40
const MAX_EXCERPT = 2000
const MAX_SAMPLE_ID = 256
const MAX_MANIFEST_VALUE = 2000
const MANIFEST_FIELD_PATTERN = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){0,9}$/u

function checkedSampleId(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_SAMPLE_ID) {
    throw new HarnessError(
      'invalid_argument',
      `Sample IDs must contain 1–${MAX_SAMPLE_ID} characters`
    )
  }
  return value
}

function evidenceError(message) {
  return new HarnessError('invalid_evidence', message)
}

export function hasValue(value) {
  return value !== undefined && value !== null
}

function sameValue(given, actual) {
  if (typeof given === 'number' && typeof actual === 'number') {
    return Math.abs(given - actual) <= 1e-6 * Math.max(Math.abs(given), Math.abs(actual))
  }
  return JSON.stringify(given) === JSON.stringify(actual)
}

async function regularFile(target) {
  const details = await lstat(target).catch(() => null)
  return Boolean(details?.isFile())
}

async function eachLine(target, visit) {
  const stream = createReadStream(target, { encoding: 'utf8' })
  const reader = readline.createInterface({ input: stream, crlfDelay: Infinity })
  try {
    for await (const line of reader) {
      if (visit(line) === false) {
        break
      }
    }
  } finally {
    reader.close()
    stream.destroy()
  }
}

/** Reads each Run, metrics file, manifest, and outputs file at most once per command. */
export function evidenceContext(project) {
  const cache = new Map()
  const once = (key, load) => {
    if (!cache.has(key)) {
      cache.set(key, load())
    }
    return cache.get(key)
  }
  return {
    project,
    run: (reference) => once(`run:${reference}`, () => resolveRunReference(project, reference)),
    metrics: (run) =>
      once(`metrics:${run.ref}`, () =>
        readMetricSeries(run.paths.metrics).catch((error) => {
          throw evidenceError(`${run.ref} metrics.jsonl is unreadable: ${error.message}`)
        })
      ),
    manifest: (run) =>
      once(`manifest:${run.ref}`, () =>
        readRunManifest(run.paths).catch((error) => {
          throw evidenceError(`${run.ref} run.json is unreadable: ${error.message}`)
        })
      ),
    samples: (run) =>
      once(`samples:${run.ref}`, async () => {
        const file = path.join(run.paths.run, 'outputs.jsonl')
        if (!(await regularFile(file))) {
          return null
        }
        const ids = new Set()
        await eachLine(file, (line) => {
          try {
            const row = JSON.parse(line)
            if (typeof row?.sampleId === 'string') {
              ids.add(row.sampleId)
            }
          } catch {
            // Malformed rows hold no sample ID to match.
          }
        })
        return ids
      }),
    claims: () =>
      once('claims', async () => new Set((await listClaims(project)).claims.map((item) => item.id)))
  }
}

async function metricEvidence(context, input) {
  const run = await context.run(input.run)
  const metric = checkedMetricName(input.metric)
  const split = input.split ?? null
  const step = input.step ?? null
  if (split !== null && typeof split !== 'string') {
    throw evidenceError('Metric evidence split must be a string or null')
  }
  if (step !== null && !Number.isFinite(step)) {
    throw evidenceError('Metric evidence step must be a number or null')
  }
  if (hasValue(input.value) && typeof input.value !== 'number') {
    throw evidenceError('Metric evidence value must be a number; omit it to record the file value')
  }
  const { series } = await context.metrics(run)
  const selection = selectMetricValue(series, {
    metric,
    split,
    select: step === null ? 'last' : 'step',
    step
  })
  if (selection.error) {
    throw evidenceError(`${run.ref}: ${selection.error}`)
  }
  if (hasValue(input.value) && !sameValue(input.value, selection.value)) {
    throw new HarnessError(
      'value_mismatch',
      `${run.ref} ${metric}${selection.step === null ? '' : `@${selection.step}`} is ${selection.value}, not ${input.value}; omit value to record the file's number`
    )
  }
  return {
    kind: 'metric',
    run: run.ref,
    metric,
    split: selection.split,
    step: selection.step,
    value: selection.value
  }
}

async function logEvidence(context, input) {
  const run = await context.run(input.run)
  const { fromLine, toLine } = input
  if (
    !Number.isInteger(fromLine) ||
    !Number.isInteger(toLine) ||
    fromLine < 1 ||
    toLine < fromLine
  ) {
    throw evidenceError('Log evidence needs whole line numbers with 1 ≤ fromLine ≤ toLine')
  }
  if (toLine - fromLine + 1 > MAX_LOG_LINES) {
    throw evidenceError(`Log evidence covers at most ${MAX_LOG_LINES} lines`)
  }
  if (!(await regularFile(run.paths.log))) {
    throw evidenceError(`${run.ref} has no train.log`)
  }
  const selected = []
  let count = 0
  await eachLine(run.paths.log, (line) => {
    count += 1
    if (count >= fromLine) {
      selected.push(line)
    }
    return count < toLine
  })
  if (count < toLine) {
    throw evidenceError(
      `${run.ref} train.log has ${count} lines; lines ${fromLine}–${toLine} are out of range`
    )
  }
  return {
    kind: 'log',
    run: run.ref,
    fromLine,
    toLine,
    excerpt: selected.join('\n').slice(0, MAX_EXCERPT)
  }
}

async function fileEvidence(context, input) {
  if (typeof input.path !== 'string' || !input.path.trim()) {
    throw evidenceError('File evidence needs a project-relative path')
  }
  let absolute
  try {
    absolute = await projectFile(context.project, input.path)
  } catch (error) {
    throw evidenceError(
      error?.code === 'ENOENT' ? `No such file in the project: ${input.path}` : error.message
    )
  }
  const relative = projectRelative(context.project, absolute)
  const line = input.line ?? null
  if (line !== null) {
    if (!Number.isInteger(line) || line < 1) {
      throw evidenceError('File evidence line must be a positive integer or null')
    }
    const lines = (await readFile(absolute, 'utf8')).split(/\r?\n/u)
    const count = lines.at(-1) === '' ? lines.length - 1 : lines.length
    if (line > count) {
      throw evidenceError(`${relative} has ${count} lines; line ${line} is out of range`)
    }
  }
  return { kind: 'file', path: relative, line }
}

async function manifestEvidence(context, input) {
  const run = await context.run(input.run)
  if (typeof input.field !== 'string' || !MANIFEST_FIELD_PATTERN.test(input.field)) {
    throw evidenceError(
      'Manifest evidence field must be a dotted run.json path like execution.exitCode'
    )
  }
  let value = await context.manifest(run)
  for (const key of input.field.split('.')) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) {
      throw evidenceError(`${run.ref} run.json has no field ${input.field}`)
    }
    value = value[key]
  }
  if (JSON.stringify(value).length > MAX_MANIFEST_VALUE) {
    throw evidenceError(`${run.ref} ${input.field} is too large to cite; cite a narrower field`)
  }
  if (hasValue(input.value) && !sameValue(input.value, value)) {
    throw new HarnessError(
      'value_mismatch',
      `${run.ref} run.json ${input.field} is ${JSON.stringify(value)}, not ${JSON.stringify(input.value)}`
    )
  }
  return { kind: 'manifest', run: run.ref, field: input.field, value }
}

async function sampleEvidence(context, input) {
  const run = await context.run(input.run)
  const sampleId = checkedSampleId(input.sampleId)
  const ids = await context.samples(run)
  if (ids && !ids.has(sampleId)) {
    throw evidenceError(`${run.ref} outputs.jsonl has no sample ${sampleId}`)
  }
  return { kind: 'sample', run: run.ref, sampleId }
}

async function claimEvidence(context, input) {
  if (typeof input.claim !== 'string' || !input.claim) {
    throw evidenceError('Claim evidence needs a claim ID')
  }
  if (!(await context.claims()).has(input.claim)) {
    throw evidenceError(`No claim ${input.claim} in the claims ledger`)
  }
  return { kind: 'claim', claim: input.claim }
}

const evidenceKinds = {
  metric: metricEvidence,
  log: logEvidence,
  file: fileEvidence,
  manifest: manifestEvidence,
  sample: sampleEvidence,
  claim: claimEvidence
}

export async function recordedEvidence(context, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw evidenceError('Each evidence item must be a JSON object')
  }
  if (!Object.hasOwn(evidenceKinds, input.kind)) {
    throw evidenceError(`Evidence kind must be one of: ${Object.keys(evidenceKinds).join(', ')}`)
  }
  return evidenceKinds[input.kind](context, input)
}

export async function checkedRuns(context, references) {
  const runs = []
  for (const reference of references) {
    const { ref } = await context.run(reference)
    if (!runs.includes(ref)) {
      runs.push(ref)
    }
  }
  if (runs.length > MAX_RUNS) {
    throw new HarnessError('invalid_argument', `A finding names at most ${MAX_RUNS} Runs`)
  }
  return runs
}

/** A sample must appear in the outputs of one of the finding's Runs whenever any has outputs. */
export async function checkedSamples(context, values, runs) {
  const samples = [...new Set(values.map(checkedSampleId))]
  if (samples.length > MAX_SAMPLES) {
    throw new HarnessError('invalid_argument', `A finding names at most ${MAX_SAMPLES} samples`)
  }
  const outputs = []
  for (const reference of runs) {
    const ids = await context.samples(await context.run(reference))
    if (ids) {
      outputs.push(ids)
    }
  }
  const missing = outputs.length
    ? samples.filter((sample) => !outputs.some((ids) => ids.has(sample)))
    : []
  if (missing.length) {
    throw evidenceError(`No outputs.jsonl of the finding's Runs has sample ${missing.join(', ')}`)
  }
  return samples
}
