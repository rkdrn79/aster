import { ipcRenderer } from 'electron'
import type {
  ResearchClaimsAuditResult,
  ResearchHarnessLocation,
  ResearchHarnessRunStatus,
  ResearchLoopLedger,
  ResearchProjectContext,
  ResearchRunPatch,
  ResearchUnbackedNumbers,
  ResearchVerificationSummary
} from '../../shared/research/research-harness-results'
import type {
  WritingCheckResult,
  WritingCodeFolder,
  WritingSkeleton,
  WritingSkeletonSection
} from '../../shared/research/research-writing-results'

type WorkspaceParams = { workspacePath: string }
type ExperimentParams = WorkspaceParams & { experiment: string }
type SkeletonParams = WorkspaceParams & { section: WritingSkeletonSection }

export type ResearchLoopStartParams = ExperimentParams & {
  objective: string
  metric: string
  direction: 'minimize' | 'maximize'
  maxRuns: number
  maxHours: number
  maxParallel: number
  gpuPolicy: string
}

/** Local projects only: the main process reads them with the bundled research harness. */
export type ResearchHarnessApi = {
  location: () => Promise<ResearchHarnessLocation>
  context: (params: WorkspaceParams) => Promise<ResearchProjectContext>
  runStatuses: (params: ExperimentParams) => Promise<ResearchHarnessRunStatus[]>
  verify: (params: ExperimentParams) => Promise<ResearchVerificationSummary>
  claimsAudit: (params: WorkspaceParams) => Promise<ResearchClaimsAuditResult>
  claimsScan: (params: WorkspaceParams) => Promise<ResearchUnbackedNumbers>
  /** Re-records a claim's evidence from the current metrics (the user accepts new results). */
  claimsRefresh: (params: WorkspaceParams & { claim: string }) => Promise<void>
  loopShow: (params: ExperimentParams) => Promise<ResearchLoopLedger | null>
  loopStart: (params: ResearchLoopStartParams) => Promise<{ experiment: string; entryId: string }>
  runPatch: (params: WorkspaceParams & { run: string }) => Promise<ResearchRunPatch>
  /** Records the end of a Run whose launcher exited without recording it. */
  runFinish: (
    params: WorkspaceParams & { run: string; status: 'failed' | 'cancelled'; note?: string }
  ) => Promise<void>
  /** The Writing page's mechanical lint of the manuscript (or one of its files). */
  writingCheck: (params: WorkspaceParams & { file?: string }) => Promise<WritingCheckResult>
  writingSkeletons: (params: WorkspaceParams) => Promise<WritingSkeleton[]>
  /** The person's edit of a skeleton; it goes back to draft until they confirm it. */
  writingSkeletonSet: (
    params: SkeletonParams & { lines: Record<string, string>; notes?: string }
  ) => Promise<WritingSkeleton>
  writingSkeletonConfirm: (params: SkeletonParams) => Promise<WritingSkeleton>
  writingCodeFolders: (params: WorkspaceParams) => Promise<WritingCodeFolder[]>
}

export const researchHarnessApi: ResearchHarnessApi = {
  location: () => ipcRenderer.invoke('researchHarness:location'),
  context: (params) => ipcRenderer.invoke('researchHarness:context', params),
  runStatuses: (params) => ipcRenderer.invoke('researchHarness:runStatuses', params),
  verify: (params) => ipcRenderer.invoke('researchHarness:verify', params),
  claimsAudit: (params) => ipcRenderer.invoke('researchHarness:claimsAudit', params),
  claimsScan: (params) => ipcRenderer.invoke('researchHarness:claimsScan', params),
  claimsRefresh: (params) => ipcRenderer.invoke('researchHarness:claimsRefresh', params),
  loopShow: (params) => ipcRenderer.invoke('researchHarness:loopShow', params),
  loopStart: (params) => ipcRenderer.invoke('researchHarness:loopStart', params),
  runPatch: (params) => ipcRenderer.invoke('researchHarness:runPatch', params),
  runFinish: (params) => ipcRenderer.invoke('researchHarness:runFinish', params),
  writingCheck: (params) => ipcRenderer.invoke('researchHarness:writingCheck', params),
  writingSkeletons: (params) => ipcRenderer.invoke('researchHarness:writingSkeletons', params),
  writingSkeletonSet: (params) => ipcRenderer.invoke('researchHarness:writingSkeletonSet', params),
  writingSkeletonConfirm: (params) =>
    ipcRenderer.invoke('researchHarness:writingSkeletonConfirm', params),
  writingCodeFolders: (params) => ipcRenderer.invoke('researchHarness:writingCodeFolders', params)
}
