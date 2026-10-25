import { defineMethod } from '../core'
import {
  ResearchRunStatusParams,
  ResearchRunWatchCancelParams,
  ResearchRunWatchListParams,
  ResearchRunWatchParams
} from '../../../../shared/rpc-contract/research-run-params'
import {
  cancelResearchRunWatch,
  createResearchRunWatch,
  listResearchRunWatches
} from '../../../research/research-run-agent-api'
import { readResearchRunStatus } from '../../../research/research-run-status'

export const RESEARCH_RUN_METHODS = [
  defineMethod({
    name: 'researchRun.status',
    permission: 'workspace',
    params: ResearchRunStatusParams,
    handler: async (params) => readResearchRunStatus(params)
  }),
  defineMethod({
    // Why workspace: it reads Run files and types into the caller's own agent, as `terminal send` can.
    name: 'researchRun.watch',
    permission: 'workspace',
    params: ResearchRunWatchParams,
    handler: async (params) => createResearchRunWatch(params)
  }),
  defineMethod({
    name: 'researchRun.watchList',
    permission: 'workspace',
    params: ResearchRunWatchListParams,
    handler: async (params) => listResearchRunWatches(params)
  }),
  defineMethod({
    name: 'researchRun.watchCancel',
    permission: 'workspace',
    params: ResearchRunWatchCancelParams,
    handler: async (params) => cancelResearchRunWatch(params)
  })
]
