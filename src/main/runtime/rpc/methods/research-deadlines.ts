import { defineMethod } from '../core'
import {
  ResearchDeadlinesReadParams,
  ResearchDeadlinesUpdateParams
} from '../../../../shared/research/research-deadlines-api'
import {
  readResearchDeadlines,
  updateResearchDeadlines
} from '../../../research/research-deadlines-host'

// Why host-scoped: each host tracks deadlines in its own data root and fetches the public
// catalogs itself, so a phone on a server sees them with no desktop online.
export const RESEARCH_DEADLINES_METHODS = [
  defineMethod({
    name: 'researchDeadlines.read',
    permission: 'workspace',
    params: ResearchDeadlinesReadParams,
    handler: async (params) => readResearchDeadlines(params)
  }),
  defineMethod({
    name: 'researchDeadlines.update',
    permission: 'workspace',
    params: ResearchDeadlinesUpdateParams,
    handler: async (params) => updateResearchDeadlines(params)
  })
]
