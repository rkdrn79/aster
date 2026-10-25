import { z } from 'zod'
import {
  authorizedProjectPath,
  callHarness,
  experimentSchema,
  handle
} from './research-harness-ipc'

// Why a separate module: starting a loop writes the brief and the ledger, the largest harness handler.
export function registerResearchLoopStartIpcHandler(): void {
  const loopStartSchema = experimentSchema.extend({
    objective: z.string().trim().min(1).max(4000),
    metric: z.string().trim().min(1).max(120),
    direction: z.enum(['minimize', 'maximize']),
    maxRuns: z.number().int().min(1).max(1000),
    maxHours: z.number().positive().max(720),
    maxParallel: z.number().int().min(1).max(4),
    gpuPolicy: z.string().trim().min(1).max(4000)
  })
  const loopBriefSchema = z
    .object({
      question: z.string().nullable(),
      primaryMetric: z
        .object({ name: z.string(), direction: z.enum(['minimize', 'maximize']) })
        .nullable()
    })
    .nullable()
  const loopNoteResultSchema = z.object({
    experiment: z.string(),
    entry: z.object({ id: z.string() })
  })
  handle('researchHarness:loopStart', loopStartSchema, async (input) => {
    const project = await authorizedProjectPath(input.workspacePath)
    const brief = loopBriefSchema.parse(
      await callHarness(
        'research-experiment-brief.mjs',
        'readExperimentBrief',
        project,
        input.experiment
      )
    )
    if (
      brief?.primaryMetric &&
      (brief.primaryMetric.name !== input.metric ||
        brief.primaryMetric.direction !== input.direction)
    ) {
      throw new Error(
        'The selected metric conflicts with this Experiment brief. Update the brief first.'
      )
    }
    await callHarness(
      'research-experiment-brief.mjs',
      'updateExperimentBrief',
      project,
      input.experiment,
      {
        ...(!brief?.question ? { question: input.objective } : {}),
        ...(!brief?.primaryMetric
          ? { primaryMetric: { name: input.metric, direction: input.direction, split: null } }
          : {}),
        agentPolicy: { proposals: 'budgeted' }
      },
      { by: 'user' }
    )
    const result = loopNoteResultSchema.parse(
      await callHarness('research-loop-ledger.mjs', 'appendLoopNote', project, {
        experiment: input.experiment,
        kind: 'objective',
        text: input.objective,
        data: {
          metric: input.metric,
          direction: input.direction,
          maxRuns: input.maxRuns,
          maxHours: input.maxHours,
          maxParallel: input.maxParallel,
          gpuPolicy: input.gpuPolicy,
          stopWhen: 'budget used, objective met, or 3 runs in a row without improvement',
          setBy: 'user'
        }
      })
    )
    return { experiment: result.experiment, entryId: result.entry.id }
  })
}
