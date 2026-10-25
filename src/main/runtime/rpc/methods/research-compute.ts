import { defineMethod } from '../core'
import { readResearchComputeStatus } from '../../../research/research-compute-local-status'

export const RESEARCH_COMPUTE_METHODS = [
  defineMethod({
    // Why separate from researchGpu.status: that one reads SSH hosts from a desktop; this reads
    // SLURM on the host the runtime itself runs on, such as an orcad on a login node.
    name: 'researchCompute.status',
    permission: 'workspace',
    params: null,
    handler: () => readResearchComputeStatus()
  })
]
