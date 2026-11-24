import { defineMethod } from '../core'
import {
  ResearchGpuHostPolicyParams,
  ResearchGpuStatusParams,
  ResearchGpuSubmitParams
} from '../../../../shared/rpc-contract/research-gpu-params'
import { applyResearchGpuHostPolicy } from '../../../research/research-gpu-host-policy'
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
  }),
  defineMethod({
    // Why settings-write: the desktop that owns the limits pushes them; agents read them only.
    name: 'researchGpu.applyHostPolicy',
    permission: 'settings-write',
    params: ResearchGpuHostPolicyParams,
    handler: async (params) => applyResearchGpuHostPolicy(params)
  })
]
