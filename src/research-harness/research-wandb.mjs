import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { catalogPath } from './research-catalog.mjs'
import { HarnessError } from './research-harness-error.mjs'

export const WANDB_TAG = 'aster'
const MAX_NAME_LENGTH = 128
// Why: W&B refuses these in entity and project names, and they would break the run URL.
const FORBIDDEN_NAME_CHARACTERS = /[/\\#?%:\s]/u
const PROBE_TIMEOUT_MS = 30_000
// Common conda roots; `~/.conda/envs` is where `conda create` puts envs on shared servers.
const CONDA_ENV_ROOTS = ['.conda/envs', 'miniconda3/envs', 'anaconda3/envs', 'miniforge3/envs']

function nameProblem(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    return `${label} is empty`
  }
  if (value.trim().length > MAX_NAME_LENGTH || FORBIDDEN_NAME_CHARACTERS.test(value.trim())) {
    return `${label} "${value}" is not a valid W&B name`
  }
  return null
}

/** `My Project!` → `my-project`, the W&B project name the app suggests for an Aster project. */
export function wandbProjectSlug(name) {
  const slug = String(name ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, '-')
    .replace(/^[-.]+|[-.]+$/gu, '')
    .slice(0, 64)
  return slug || 'aster'
}

/**
 * The catalog's optional `wandb` section, checked. Null when absent or off; `{ error }` when on
 * but unusable, so `run exec` can warn instead of mirroring to a wrong place.
 */
export function wandbSettingsFromCatalog(catalog, projectRoot) {
  const section = catalog?.wandb
  if (
    !section ||
    typeof section !== 'object' ||
    Array.isArray(section) ||
    section.enabled !== true
  ) {
    return null
  }
  const project =
    typeof section.project === 'string' && section.project.trim()
      ? section.project.trim()
      : wandbProjectSlug(path.basename(projectRoot))
  const entity =
    typeof section.entity === 'string' && section.entity.trim() ? section.entity.trim() : null
  const problem =
    nameProblem(project, 'W&B project') ?? (entity ? nameProblem(entity, 'W&B entity') : null)
  if (problem) {
    return { error: problem }
  }
  const python =
    typeof section.python === 'string' && section.python.trim() ? section.python.trim() : null
  return { enabled: true, entity, project, python }
}

/** Reads only the stored catalog file: no Experiment scan, so it is cheap at every launch. */
export async function readWandbSettings(project) {
  let catalog
  try {
    catalog = JSON.parse(await readFile(catalogPath(project), 'utf8'))
  } catch {
    return null
  }
  return wandbSettingsFromCatalog(catalog, project)
}

export async function requireWandbSettings(project) {
  const settings = await readWandbSettings(project)
  if (!settings) {
    throw new HarnessError(
      'wandb_disabled',
      'W&B is off for this project; turn it on from the project menu (W&B…) or set "wandb": {"enabled": true, ...} in the catalog'
    )
  }
  if (settings.error) {
    throw new HarnessError('invalid_argument', settings.error)
  }
  return settings
}

/**
 * The W&B run ID for one Aster Run: the same project, Experiment and Run always give the same ID,
 * so a second mirror of the Run resumes its W&B run instead of creating a duplicate.
 */
export function wandbRunId({ project, experiment, run }) {
  const digest = createHash('sha256').update(`${project}\n${experiment}\n${run}`).digest('hex')
  return `aster-${digest.slice(0, 16)}`
}

/**
 * Variables for the training command, so its own `wandb.init()` lands in the same project and
 * group. No run ID or name: those belong to the mirror's run.
 */
export function wandbChildEnvironment(settings, experiment) {
  return {
    WANDB_PROJECT: settings.project,
    ...(settings.entity ? { WANDB_ENTITY: settings.entity } : {}),
    WANDB_RUN_GROUP: experiment,
    WANDB_TAGS: WANDB_TAG
  }
}

function probePython(command) {
  return new Promise((resolve) => {
    let child
    try {
      // Why the version check: an old `python` may be Python 2 with a Python 2 wandb.
      child = spawn(
        command,
        ['-c', 'import sys, wandb; sys.exit(0 if sys.version_info >= (3, 6) else 1)'],
        { stdio: 'ignore', windowsHide: true, timeout: PROBE_TIMEOUT_MS }
      )
    } catch {
      resolve(false)
      return
    }
    child.once('error', () => resolve(false))
    child.once('close', (code) => resolve(code === 0))
  })
}

async function condaPythons(home, platform) {
  const found = []
  for (const root of CONDA_ENV_ROOTS) {
    const envs = await readdir(path.join(home, root), { withFileTypes: true }).catch(() => [])
    for (const entry of envs
      .filter((item) => item.isDirectory() || item.isSymbolicLink())
      .map((item) => item.name)
      .sort()) {
      found.push(
        platform === 'win32'
          ? path.join(home, root, entry, 'python.exe')
          : path.join(home, root, entry, 'bin', 'python')
      )
    }
  }
  return found
}

function expandHome(command, home) {
  return command === '~' || command.startsWith('~/') ? path.join(home, command.slice(1)) : command
}

/**
 * Finds a Python that can `import wandb`: the catalog's `wandb.python`, then `python3` and
 * `python` on PATH, then conda envs. The answer is cached for the life of the process.
 */
export function createWandbPythonFinder({
  probe = probePython,
  listCondaPythons = condaPythons,
  home = os.homedir(),
  platform = process.platform
} = {}) {
  const cache = new Map()
  async function discover(explicit) {
    const onPath = platform === 'win32' ? ['python', 'python3'] : ['python3', 'python']
    for (const candidate of [explicit ? expandHome(explicit, home) : null, ...onPath]) {
      if (candidate && (await probe(candidate))) {
        return candidate
      }
    }
    for (const candidate of await listCondaPythons(home, platform)) {
      if (await probe(candidate)) {
        return candidate
      }
    }
    return null
  }
  return (explicit = null) => {
    const key = explicit ?? ''
    if (!cache.has(key)) {
      cache.set(key, discover(explicit))
    }
    return cache.get(key)
  }
}

export const findWandbPython = createWandbPythonFinder()
