import { realpath } from 'node:fs/promises'
import { readExperimentBrief } from './research-experiment-brief.mjs'
import { experimentSlug, runPaths } from './research-layout.mjs'
import { readLoopLedger } from './research-loop-ledger.mjs'
import { listRuns } from './research-project-context.mjs'
import { readRunManifest, resolveRunReference } from './research-run-manifest.mjs'

function issue(id, message, action) {
  return { id, message, action }
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0
}

function positiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/** Read-only contract check before an agent plans another Run. It does not launch or reserve resources. */
export async function researchPreflight(projectPath, experiment, { loop = false } = {}) {
  const project = await realpath(projectPath)
  const slug = experimentSlug(experiment)
  const brief = await readExperimentBrief(project, slug)
  const blockers = []
  const warnings = []

  if (!brief) {
    blockers.push(
      issue(
        'brief.missing',
        'The Experiment has no research brief',
        `brief set --experiment ${slug}`
      )
    )
  } else {
    if (!brief.question) {
      blockers.push(
        issue('brief.question-missing', 'The research question is not recorded', 'Set --question')
      )
    }
    if (!brief.primaryMetric) {
      blockers.push(
        issue(
          'brief.primary-metric-missing',
          'The primary metric and direction are not recorded',
          'Set --primary-metric NAME:minimize|maximize[:SPLIT]'
        )
      )
    } else if (!brief.primaryMetric.split) {
      warnings.push(
        issue('brief.metric-split-unknown', 'The primary metric has no split', 'Record its split')
      )
    }
    if (!brief.hypothesis) {
      warnings.push(
        issue(
          'brief.hypothesis-missing',
          'No falsifiable hypothesis is recorded',
          'Set --hypothesis'
        )
      )
    }
    if (!brief.evaluation) {
      warnings.push(
        issue(
          'evaluation.dataset-unknown',
          'The evaluation dataset is not recorded',
          'Set --dataset-id'
        )
      )
    } else {
      for (const [field, option] of [
        ['datasetRevision', '--dataset-revision'],
        ['split', '--eval-split'],
        ['evaluatorRevision', '--evaluator-revision']
      ]) {
        if (!brief.evaluation[field]) {
          warnings.push(
            issue(
              `evaluation.${field}-unknown`,
              `Evaluation ${field} is not recorded`,
              `Set ${option}`
            )
          )
        }
      }
      if (
        brief.primaryMetric?.split &&
        brief.evaluation.split &&
        brief.primaryMetric.split !== brief.evaluation.split
      ) {
        blockers.push(
          issue(
            'evaluation.split-conflict',
            `Primary metric split ${brief.primaryMetric.split} differs from evaluation split ${brief.evaluation.split}`,
            'Resolve the two recorded splits before launching'
          )
        )
      }
    }
    if (!brief.baseline) {
      warnings.push(
        issue(
          'comparison.baseline-missing',
          'No baseline Run is selected',
          'Set --baseline after a baseline exists'
        )
      )
    } else {
      const baseline = await resolveRunReference(project, brief.baseline).catch(() => null)
      const manifest = baseline ? await readRunManifest(baseline.paths).catch(() => null) : null
      if (manifest?.execution?.state !== 'succeeded') {
        warnings.push(
          issue(
            'comparison.baseline-unfinished',
            `Baseline ${brief.baseline} is ${manifest?.execution?.state ?? 'unavailable'}`,
            'Check its execution evidence before comparing'
          )
        )
      }
    }
  }

  let loopState = null
  if (loop) {
    const ledger = await readLoopLedger(project, slug, { limit: Number.MAX_SAFE_INTEGER })
    const data = ledger.objective?.data ?? {}
    const runs = (await listRuns(project, { experiment: slug })).runs
    const active = runs.filter((run) => run.state === 'running')
    const objectiveTime = Date.parse(ledger.objective?.at ?? '')
    const objectiveIndex = ledger.entries.findIndex((entry) => entry.id === ledger.objective?.id)
    const noted = new Set(
      ledger.entries
        .slice(objectiveIndex + 1)
        .filter((entry) => entry.kind === 'run')
        .map((entry) => entry.run)
    )
    const unnoted = ledger.objective
      ? (
          await Promise.all(
            runs.map(async (run) => {
              const manifest = await readRunManifest(runPaths(project, slug, run.id)).catch(
                () => null
              )
              const created = Date.parse(manifest?.harness?.createdAt ?? '')
              return created > objectiveTime && !noted.has(run.ref) ? run.ref : null
            })
          )
        ).filter(Boolean)
      : []
    loopState = {
      objective: ledger.objective?.id ?? null,
      budget: ledger.budget,
      activeRuns: active.map((run) => run.ref),
      unnotedRuns: unnoted,
      proposalPolicy: brief?.agentPolicy.proposals ?? 'approval'
    }
    if (!ledger.objective) {
      blockers.push(
        issue(
          'loop.objective-missing',
          'No loop objective is recorded',
          'Add a loop objective note'
        )
      )
    } else {
      for (const [field, valid] of [
        ['maxRuns', positiveInteger(data.maxRuns)],
        ['maxHours', positiveNumber(data.maxHours)],
        ['maxParallel', positiveInteger(data.maxParallel)],
        ['stopWhen', typeof data.stopWhen === 'string' && Boolean(data.stopWhen.trim())],
        ['gpuPolicy', typeof data.gpuPolicy === 'string' && Boolean(data.gpuPolicy.trim())]
      ]) {
        if (!valid) {
          blockers.push(
            issue(
              `loop.${field}-missing`,
              `Loop objective needs a valid ${field}`,
              'Update the objective note'
            )
          )
        }
      }
      if (ledger.budget?.exhausted) {
        blockers.push(
          issue(
            'loop.budget-exhausted',
            'The recorded loop budget is exhausted',
            'Stop for a human checkpoint'
          )
        )
      }
      if (unnoted.length) {
        blockers.push(
          issue(
            'loop.unnoted-runs',
            `${unnoted.length} Run(s) created after the objective are missing from loop.jsonl: ${unnoted.join(', ')}`,
            'Record the Run notes before another launch'
          )
        )
      }
      if (positiveInteger(data.maxParallel) && active.length >= data.maxParallel) {
        blockers.push(
          issue(
            'loop.parallel-limit',
            `${active.length} Run(s) are marked running; maxParallel is ${data.maxParallel}`,
            'Wait for a Run to finish or resolve its recorded state'
          )
        )
      }
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    experiment: slug,
    mode: loop ? 'autonomous_loop' : 'single_run',
    ready: blockers.length === 0,
    blockers,
    warnings,
    loop: loopState,
    limitations: [
      'Preflight checks recorded metadata only; it does not validate scientific merit or reserve compute.',
      ...(loop
        ? [
            'Loop budget counts recorded loop Run notes; concurrent launches are not atomically reserved.'
          ]
        : [])
    ]
  }
}
