import { defineMethod } from '../core'
import { readResearchDocument } from '../../../research/research-repository'
import { readResearchLogTail } from '../../../research/research-log-tail'
import { researchRunLogTailParamsSchema } from '../../../../shared/research/research-records'

export const RESEARCH_RECORD_METHODS = [
  defineMethod({
    name: 'research.records.read',
    permission: 'workspace',
    params: null,
    handler: () => readResearchDocument()
  }),
  defineMethod({
    name: 'research.run.logTail',
    permission: 'workspace',
    params: researchRunLogTailParamsSchema,
    handler: async ({ runId }, { runtime }) => {
      const document = await readResearchDocument()
      const run = document.runs.find((entry) => entry.id === runId)
      if (!run) {
        throw new Error('Research Run was not found.')
      }
      return readResearchLogTail(runtime, run)
    }
  })
]
