import { lstat, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { agentIdentityFromEnvironment } from './research-agent-identity.mjs'
import { withFileLock, writeJsonAtomically } from './research-file-transactions.mjs'
import { HarnessError } from './research-harness-error.mjs'
import { experimentPaths, experimentRelativePath, experimentSlug } from './research-layout.mjs'
import { checkedMetricName } from './research-metric-events.mjs'
import { resolveRunReference } from './research-run-manifest.mjs'

export const EXPERIMENT_STATUSES = ['planned', 'running', 'analyzing', 'concluded', 'abandoned']
export const TRIAGE_POLICIES = ['off', 'suggest', 'auto']
export const PROPOSAL_POLICIES = ['off', 'approval', 'budgeted']
export const BRIEF_FIELDS = [
  'question',
  'hypothesis',
  'status',
  'primaryMetric',
  'evaluation',
  'baseline',
  'minSeeds',
  'rubric',
  'agentPolicy',
  'conclusion'
]
const DIRECTIONS = ['minimize', 'maximize']
const AUTHORS = ['user', 'agent']
const DEFAULT_AGENT_POLICY = { triage: 'suggest', proposals: 'approval' }
const EVALUATION_KEYS = ['datasetId', 'datasetRevision', 'split', 'evaluatorRevision']
const MAX_TEXT = 4000
const MAX_NAME = 200

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function metadataPath(project, slug) {
  return path.join(experimentPaths(project, slug).experiment, 'experiment.json')
}

async function readMetadata(project, slug) {
  const target = metadataPath(project, slug)
  const details = await lstat(target).catch(() => null)
  if (!details?.isFile() || details.isSymbolicLink()) {
    throw new HarnessError('experiment_not_found', `Experiment ${slug} does not exist`)
  }
  const metadata = JSON.parse(await readFile(target, 'utf8'))
  if (!isObject(metadata)) {
    throw new HarnessError(
      'invalid_layout',
      `${experimentRelativePath(project, slug)}/experiment.json is not a JSON object`
    )
  }
  return metadata
}

function storedText(value, max = MAX_TEXT) {
  return typeof value === 'string' && value.trim() && value.length <= max ? value : null
}

function storedEvaluation(value) {
  if (!storedText(value?.datasetId, MAX_NAME)) {
    return null
  }
  return Object.fromEntries(EVALUATION_KEYS.map((key) => [key, storedText(value[key], MAX_NAME)]))
}

// Why lenient: experiment.json is hand-edited; one bad field reads as unset instead of hiding the rest.
function storedBrief(value) {
  if (!isObject(value)) {
    return null
  }
  const metric = value.primaryMetric
  const policy = isObject(value.agentPolicy) ? value.agentPolicy : {}
  return {
    question: storedText(value.question),
    hypothesis: storedText(value.hypothesis),
    status: EXPERIMENT_STATUSES.includes(value.status) ? value.status : 'planned',
    primaryMetric:
      storedText(metric?.name, MAX_NAME) && DIRECTIONS.includes(metric.direction)
        ? {
            name: metric.name,
            split: storedText(metric.split, MAX_NAME),
            direction: metric.direction
          }
        : null,
    evaluation: storedEvaluation(value.evaluation),
    baseline: storedText(value.baseline, MAX_NAME),
    minSeeds:
      Number.isInteger(value.minSeeds) && value.minSeeds >= 1 && value.minSeeds <= 20
        ? value.minSeeds
        : null,
    rubric: storedText(value.rubric),
    agentPolicy: {
      triage: TRIAGE_POLICIES.includes(policy.triage) ? policy.triage : DEFAULT_AGENT_POLICY.triage,
      proposals: PROPOSAL_POLICIES.includes(policy.proposals)
        ? policy.proposals
        : DEFAULT_AGENT_POLICY.proposals
    },
    conclusion: storedText(value.conclusion),
    updatedAt: storedText(value.updatedAt, 64),
    updatedBy: AUTHORS.includes(value.updatedBy) ? value.updatedBy : null
  }
}

/** The Experiment's brief with defaults filled in, or null when experiment.json has none. */
export async function readExperimentBrief(projectPath, experiment) {
  const project = await realpath(projectPath)
  const metadata = await readMetadata(project, experimentSlug(experiment))
  return storedBrief(metadata.brief)
}

function checkedText(value, label, max = MAX_TEXT) {
  if (value === null) {
    return null
  }
  if (typeof value !== 'string') {
    throw new HarnessError('invalid_argument', `${label} must be text`)
  }
  const trimmed = value.trim()
  if (trimmed.length > max) {
    throw new HarnessError('invalid_argument', `${label} must be at most ${max} characters`)
  }
  return trimmed || null
}

function checkedChoice(value, label, choices) {
  if (value !== null && !choices.includes(value)) {
    throw new HarnessError('invalid_argument', `${label} must be one of: ${choices.join(', ')}`)
  }
  return value
}

function checkedPrimaryMetric(value) {
  if (value === null) {
    return null
  }
  if (!isObject(value)) {
    throw new HarnessError('invalid_argument', 'Primary metric needs a name and a direction')
  }
  const name = checkedMetricName(value.name)
  if (name.length > MAX_NAME) {
    throw new HarnessError('invalid_argument', `Metric name must be at most ${MAX_NAME} characters`)
  }
  if (!DIRECTIONS.includes(value.direction)) {
    throw new HarnessError(
      'invalid_argument',
      'Primary metric direction must be minimize or maximize'
    )
  }
  return {
    name,
    split: checkedText(value.split ?? null, 'Primary metric split', MAX_NAME),
    direction: value.direction
  }
}

/** Partial: only the evaluation keys the caller passed are changed. */
function checkedEvaluation(value) {
  if (value === null) {
    return null
  }
  if (!isObject(value)) {
    throw new HarnessError('invalid_argument', 'Evaluation must be an object')
  }
  const checked = {}
  for (const [key, item] of Object.entries(value)) {
    if (!EVALUATION_KEYS.includes(key)) {
      throw new HarnessError('invalid_argument', `Unknown evaluation field: ${key}`)
    }
    if (item !== undefined) {
      checked[key] = checkedText(item, `Evaluation ${key}`, MAX_NAME)
    }
  }
  return checked
}

/** Partial: only the policies the caller passed are changed; null restores the default. */
function checkedAgentPolicy(value) {
  if (value === null) {
    return null
  }
  if (!isObject(value)) {
    throw new HarnessError('invalid_argument', 'Agent policy must be an object')
  }
  const checked = {}
  for (const [key, item] of Object.entries(value)) {
    const choices = { triage: TRIAGE_POLICIES, proposals: PROPOSAL_POLICIES }[key]
    if (!choices) {
      throw new HarnessError('invalid_argument', `Unknown agent policy: ${key}`)
    }
    if (item !== undefined) {
      checked[key] =
        checkedChoice(item, `Agent policy ${key}`, choices) ?? DEFAULT_AGENT_POLICY[key]
    }
  }
  return checked
}

function checkedMinSeeds(value) {
  if (value !== null && !(Number.isInteger(value) && value >= 1 && value <= 20)) {
    throw new HarnessError('invalid_argument', 'Min seeds must be an integer from 1 to 20')
  }
  return value
}

async function checkedBaseline(project, value) {
  const reference = checkedText(value, 'Baseline', MAX_NAME)
  return reference === null ? null : (await resolveRunReference(project, reference)).ref
}

function outsideProject(project, target) {
  const relative = path.relative(project, target)
  return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
}

async function checkedRubric(project, value) {
  const file = checkedText(value, 'Rubric')
  if (file === null) {
    return null
  }
  const candidate = path.resolve(project, file)
  const actual = outsideProject(project, candidate)
    ? null
    : await realpath(candidate).catch((error) => {
        if (error?.code === 'ENOENT') {
          throw new HarnessError('not_found', `Rubric file not found: ${file}`)
        }
        throw error
      })
  if (!actual || outsideProject(project, actual)) {
    throw new HarnessError('invalid_argument', `Rubric must be a file inside the project: ${file}`)
  }
  if (!(await lstat(actual)).isFile()) {
    throw new HarnessError('invalid_argument', `Rubric must be a regular file: ${file}`)
  }
  return path.relative(project, actual).split(path.sep).join('/')
}

async function checkedPatch(project, patch) {
  if (!isObject(patch)) {
    throw new HarnessError('invalid_argument', 'Brief patch must be an object')
  }
  const checked = {}
  for (const [key, value] of Object.entries(patch)) {
    if (!BRIEF_FIELDS.includes(key)) {
      throw new HarnessError('invalid_argument', `Unknown brief field: ${key}`)
    }
    if (value === undefined) {
      continue
    }
    if (key === 'question' || key === 'hypothesis' || key === 'conclusion') {
      checked[key] = checkedText(value, key[0].toUpperCase() + key.slice(1))
    } else if (key === 'status') {
      checked.status = checkedChoice(value, 'Status', EXPERIMENT_STATUSES)
    } else if (key === 'primaryMetric') {
      checked.primaryMetric = checkedPrimaryMetric(value)
    } else if (key === 'evaluation') {
      checked.evaluation = checkedEvaluation(value)
    } else if (key === 'baseline') {
      checked.baseline = await checkedBaseline(project, value)
    } else if (key === 'minSeeds') {
      checked.minSeeds = checkedMinSeeds(value)
    } else if (key === 'rubric') {
      checked.rubric = await checkedRubric(project, value)
    } else if (key === 'agentPolicy') {
      checked.agentPolicy = checkedAgentPolicy(value)
    }
  }
  return checked
}

function emptyBrief() {
  return storedBrief({})
}

function mergedEvaluation(current, patch) {
  if (patch === null) {
    return null
  }
  const merged = {
    ...Object.fromEntries(EVALUATION_KEYS.map((key) => [key, current?.[key] ?? null])),
    ...patch
  }
  if (merged.datasetId) {
    return merged
  }
  if (EVALUATION_KEYS.some((key) => merged[key])) {
    throw new HarnessError('invalid_argument', 'Evaluation details require a dataset ID')
  }
  return null
}

function mergedBrief(current, patch) {
  const next = { ...current }
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'evaluation') {
      next.evaluation = mergedEvaluation(current.evaluation, value)
    } else if (key === 'agentPolicy') {
      next.agentPolicy = {
        ...(value === null ? DEFAULT_AGENT_POLICY : current.agentPolicy),
        ...value
      }
    } else if (key === 'status') {
      next.status = value ?? 'planned'
    } else {
      next[key] = value
    }
  }
  return next
}

/**
 * Applies a patch to experiment.json's `brief` under its lock, keeping every other key: omitted
 * fields stay, null clears. `by` defaults to agent when an agent CLI launched the command.
 */
export async function updateExperimentBrief(projectPath, experiment, patch, { by } = {}) {
  const project = await realpath(projectPath)
  const slug = experimentSlug(experiment)
  const author = by ?? (agentIdentityFromEnvironment() ? 'agent' : 'user')
  if (!AUTHORS.includes(author)) {
    throw new HarnessError('invalid_argument', 'By must be user or agent')
  }
  await readMetadata(project, slug)
  const checked = await checkedPatch(project, patch)
  const target = metadataPath(project, slug)
  const brief = await withFileLock(`${target}.lock`, async () => {
    const metadata = await readMetadata(project, slug)
    const next = {
      ...mergedBrief(storedBrief(metadata.brief) ?? emptyBrief(), checked),
      updatedAt: new Date().toISOString(),
      updatedBy: author
    }
    // Why keep the raw brief's extra keys: a newer harness may store fields this one does not know.
    const raw = isObject(metadata.brief) ? metadata.brief : {}
    await writeJsonAtomically(target, { ...metadata, brief: { ...raw, ...next } })
    return next
  })
  return { experiment: slug, brief }
}
