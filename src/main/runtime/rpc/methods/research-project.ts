import { defineMethod } from '../core'
import {
  ResearchProjectReadParams,
  ResearchProjectRunLogTailParams,
  ResearchProjectRunReadParams
} from '../../../../shared/research/research-project-api'
import { ResearchProjectClaimsAuditParams } from '../../../../shared/research/research-project-claims-api'
import { ResearchProjectLibraryReadParams } from '../../../../shared/research/research-project-library-api'
import { readResearchProjectClaimsAudit } from '../../../research/research-project-claims-read'
import { resolveResearchProjectRoot } from '../../../research/research-project-files'
import { readResearchProjectLibrary } from '../../../research/research-project-library-read'
import { readResearchProject } from '../../../research/research-project-overview'
import {
  readResearchProjectRun,
  readResearchProjectRunLogTail
} from '../../../research/research-project-run-read'

// Why here and not research.records.*: these read the workspace's own research/ folder on the host
// that owns it, so the desktop and the phone see the same server-side Runs.
export const RESEARCH_PROJECT_METHODS = [
  defineMethod({
    name: 'researchProject.read',
    permission: 'workspace',
    params: ResearchProjectReadParams,
    handler: async (params, { runtime }) =>
      readResearchProject(await resolveResearchProjectRoot(runtime, params.worktree))
  }),
  defineMethod({
    name: 'researchProject.runRead',
    permission: 'workspace',
    params: ResearchProjectRunReadParams,
    handler: async (params, { runtime }) =>
      readResearchProjectRun(await resolveResearchProjectRoot(runtime, params.worktree), params)
  }),
  defineMethod({
    name: 'researchProject.runLogTail',
    permission: 'workspace',
    params: ResearchProjectRunLogTailParams,
    handler: async (params, { runtime }) =>
      readResearchProjectRunLogTail(
        await resolveResearchProjectRoot(runtime, params.worktree),
        params
      )
  }),
  defineMethod({
    name: 'researchProject.claimsAudit',
    permission: 'workspace',
    params: ResearchProjectClaimsAuditParams,
    handler: async (params, { runtime }) =>
      readResearchProjectClaimsAudit(await resolveResearchProjectRoot(runtime, params.worktree))
  }),
  defineMethod({
    name: 'researchProject.libraryRead',
    permission: 'workspace',
    params: ResearchProjectLibraryReadParams,
    handler: async (params, { runtime }) =>
      readResearchProjectLibrary(await resolveResearchProjectRoot(runtime, params.worktree))
  })
]
