// Harness calls for seed-quality-demo.mjs. Every record goes through the Aster harness CLI; this
// module only reads files back (metrics, outputs) to quote real values in notes and findings.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

// How proposals spell the harness: the README runs every command from the demo folder.
const SHOWN_HARNESS = 'node ../../src/research-harness/cli.mjs'
const JUDGE_MODEL = 'claude-opus-5-5'
const AGENT_VARIABLES = new Set([
  'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_SESSION_ID',
  'AI_AGENT',
  'GEMINI_CLI',
  'ORCA_AGENT_SESSION_ID',
  'ORCA_TERMINAL_HANDLE',
  'ORCA_PANE_KEY',
  'ORCA_AGENT_PANE'
])

function environment(extra) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !AGENT_VARIABLES.has(key) && !key.startsWith('CODEX_')
    )
  )
  return { ...env, ...extra }
}

// The demo's agents are the Claude Code session and Codex thread of the base demo; the user is
// a shell without any agent variable, which is what lets the harness accept `--by user`.
export const user = environment({})
export const claude = environment({
  CLAUDECODE: '1',
  CLAUDE_CODE_SESSION_ID: 'demo-claude-session-7f3a'
})
export const codex = environment({ CODEX_THREAD_ID: 'demo-codex-thread-2b91' })

const target = { project: null, harness: null }

export function targetProject(project, harness) {
  target.project = project
  target.harness = harness
}

/** ['--key', value] per entry; an array repeats the flag, true adds it bare, null skips it. */
export function flags(values) {
  return Object.entries(values).flatMap(([key, value]) => {
    if (value === null || value === undefined || value === false) {
      return []
    }
    if (value === true) {
      return [`--${key}`]
    }
    return (Array.isArray(value) ? value : [value]).flatMap((item) => [`--${key}`, String(item)])
  })
}

/** Runs the harness with --project and --json (both before any `--`) and returns its result. */
export function cli(env, args, { allowFailure = false } = {}) {
  const dash = args.includes('--') ? args.indexOf('--') : args.length
  const full = [...args.slice(0, dash), '--project', target.project, '--json', ...args.slice(dash)]
  const result = spawnSync(process.execPath, [target.harness, ...full], {
    cwd: target.project,
    env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
  let parsed = null
  try {
    parsed = JSON.parse(result.stdout)
  } catch {
    parsed = null
  }
  if (!parsed || (!parsed.ok && !allowFailure)) {
    const reason = parsed?.error?.message ?? result.stderr
    throw new Error(`harness ${args.slice(0, 2).join(' ')} failed: ${reason}`)
  }
  return parsed
}

export function step(text) {
  console.log(`- ${text}`)
}

export function catalog(at = target.project) {
  const stored = JSON.parse(readFileSync(join(at, '.aster/project.json'), 'utf8'))
  const experimentsRoot = join(at, '.aster/experiments')
  const experiments = existsSync(experimentsRoot)
    ? readdirSync(experimentsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => {
          const slug = entry.name
          const experimentRoot = join(experimentsRoot, slug)
          const record = JSON.parse(readFileSync(join(experimentRoot, 'experiment.json'), 'utf8'))
          const runsRoot = join(experimentRoot, 'runs')
          const runs = existsSync(runsRoot)
            ? readdirSync(runsRoot, { withFileTypes: true })
                .filter(
                  (run) => run.isDirectory() && existsSync(join(runsRoot, run.name, 'run.json'))
                )
                .map((run) => ({
                  id: run.name,
                  manifest: `.aster/experiments/${slug}/runs/${run.name}/run.json`
                }))
            : []
          return { slug, name: record.name, path: `.aster/experiments/${slug}`, runs }
        })
    : []
  return { ...stored, experiments }
}

export function catalogRunDirectories(at = target.project) {
  return catalog(at).experiments.flatMap((experiment) =>
    experiment.runs.map((entry) => join(at, dirname(entry.manifest)))
  )
}

// --- Reading results back --------------------------------------------------------------------

export function runDirectory(ref) {
  const [slug, id] = ref.split('/')
  return join(target.project, '.aster/experiments', slug, 'runs', id)
}

/** The metric's value at `at`, or its last value, from the Run's metrics.jsonl. */
export function metricValue(ref, name, split, at = null) {
  let found = null
  for (const line of readFileSync(join(runDirectory(ref), 'metrics.jsonl'), 'utf8').split('\n')) {
    const row = line.trim() ? JSON.parse(line) : null
    const value = row?.metrics?.[name]
    if (row?.split === split && typeof value === 'number' && (at === null || row.step === at)) {
      found = { value, step: row.step }
    }
  }
  if (!found) {
    throw new Error(`${ref} has no ${split} ${name}${at === null ? '' : ` at step ${String(at)}`}`)
  }
  return found
}

export function outputs(ref) {
  return readFileSync(join(runDirectory(ref), 'outputs.jsonl'), 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line))
}

/** Writes the Experiment's rubric (the user's document, not a record) and returns its path. */
export function writeRubric(slug, text) {
  const path = `.aster/experiments/${slug}/rubric.md`
  writeFileSync(join(target.project, path), text)
  return path
}

export function points(value) {
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)} pt`
}

export function decibels(value, signed = true) {
  return `${signed && value >= 0 ? '+' : ''}${value.toFixed(2)} dB`
}

function shellWord(word) {
  return /^[\w@%+=:,./-]+$/u.test(word) ? word : `"${word.replace(/(["\\$`])/gu, '\\$1')}"`
}

/** A `run exec` launch: the argv the seed runs and the command text a proposal shows. */
export function launch(runFlags, command) {
  const args = ['run', 'exec', ...flags(runFlags), '--', ...command]
  return { args, text: `${SHOWN_HARNESS} ${args.map(shellWord).join(' ')}` }
}

// --- Records ---------------------------------------------------------------------------------

function actor(env) {
  return env === user ? 'user' : 'agent'
}

export function brief(slug, values) {
  cli(user, ['brief', 'set', ...flags({ experiment: slug, ...values, by: 'user' })])
  step(`${slug}: user brief ${Object.keys(values).join(', ')}`)
}

export function finding(
  slug,
  { check, severity, text, layer = 'integrity', runs, samples, items }
) {
  const result = cli(claude, [
    'quality',
    'add',
    ...flags({ experiment: slug, check, severity, layer, text, 'created-by': 'agent' }),
    ...flags({ run: runs, sample: samples, evidence: items.map((item) => JSON.stringify(item)) })
  ])
  step(`${slug}: agent ${result.finding.id} (${check})`)
  return result.finding.id
}

export function resolveFinding(env, slug, id, status, note) {
  const by = actor(env)
  cli(env, ['quality', 'resolve', ...flags({ experiment: slug, id, status, by, note })])
  step(`${slug}: ${by} marked ${id} ${status}`)
}

export function propose(slug, { title, rationale, plan, configChanges, findings, runs }) {
  const result = cli(claude, [
    'proposal',
    'add',
    ...flags({ experiment: slug, title, rationale, command: plan.text }),
    ...flags({ 'config-changes': JSON.stringify(configChanges), finding: findings, run: runs })
  ])
  step(`${slug}: agent proposed ${result.proposal.id} "${title}"`)
  return result.proposal.id
}

export function decide(slug, id, decision, note) {
  cli(user, ['proposal', 'decide', ...flags({ experiment: slug, id, decision, note, by: 'user' })])
  step(`${slug}: user ${decision} ${id}`)
}

export function launched(slug, id, ref) {
  cli(claude, ['proposal', 'launched', ...flags({ experiment: slug, id, run: ref })])
  step(`${slug}: agent recorded ${id} launched as ${ref}`)
}

export function execute(env, plan, { mayFail = false } = {}) {
  const result = cli(env, plan.args, { allowFailure: mayFail })
  if (!mayFail && result.state !== 'succeeded') {
    throw new Error(`${result.ref} ended ${result.state}`)
  }
  step(
    `run exec ${result.ref}: ${result.state}, ${result.metricEvents} metrics, ${result.mediaItems} media`
  )
  return result.ref
}

export function note(env, ref, text) {
  const by = actor(env)
  cli(env, ['run', 'annotate', ...flags({ run: ref, text, by })])
  step(`${by} note on ${ref}`)
}

/** A sample judgment; agent ones carry the Experiment's rubric and the judge model. */
export function rate(env, slug, rating) {
  const by = actor(env)
  const judge =
    by === 'agent'
      ? { rubric: `.aster/experiments/${slug}/rubric.md`, 'judge-model': JUDGE_MODEL }
      : {}
  cli(env, ['rate', 'add', ...flags({ experiment: slug, ...rating, by, ...judge })])
}
