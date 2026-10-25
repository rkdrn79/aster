import { defineMethod } from '../core'
import {
  ResearchGpuStatusParams,
  ResearchGpuSubmitParams
} from '../../../../shared/rpc-contract/research-gpu-params'
import {
  readResearchGpuAgentStatus,
  submitResearchGpuAgentJob
} from '../../../research/research-gpu-agent-api'

export const RESEARCH_GPU_METHODS = [
  defineMethod({
    name: 'researchGpu.status',
    permission: 'workspace',
    params: ResearchGpuStatusParams,
    handler: async (params) => readResearchGpuAgentStatus(params)
  }),
  defineMethod({
    // Why workspace: it runs sbatch as this user, which a terminal in Aster can do anyway.
    name: 'researchGpu.submit',
    permission: 'workspace',
    params: ResearchGpuSubmitParams,
    handler: async (params) => submitResearchGpuAgentJob(params)
  })
]
