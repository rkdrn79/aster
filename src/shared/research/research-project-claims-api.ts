import { WorktreeSelector } from '../rpc-contract/files-target-params'
import type { ResearchClaimAudit, ResearchClaimsAuditResult } from './research-harness-results'
import type {
  RESEARCH_PROJECT_API_VERSION,
  ResearchProjectFile,
  ResearchProjectFileStatus
} from './research-project-api'

export const ResearchProjectClaimsAuditParams = WorktreeSelector.extend({})

/** A result-like number in the manuscript that no claim's evidence accounts for. */
export type ResearchProjectUnbackedNumber = {
  /** The number as written, e.g. `81.4\%`. */
  text: string
  /** Project-relative manuscript file. */
  file: string
  line: number
  /** The trimmed source line, at most 160 characters. */
  context: string
}

export type ResearchProjectClaimsAuditResult = {
  version: typeof RESEARCH_PROJECT_API_VERSION
  catalog: ResearchProjectFileStatus
  manuscript: {
    /** Project-relative paths from the harness catalog; null when it names none. */
    source: string | null
    pdf: string | null
    /** The built PDF; read its bytes with `files.stat` and `files.readChunk`. */
    pdfFile: ResearchProjectFile<{ bytes: number; modifiedAt: string }>
  }
  /** research/claims.json audited by the harness; `absent` when the project has no ledger. */
  claims: ResearchProjectFile<{
    summary: ResearchClaimsAuditResult['summary']
    /** Each with its evidence (run, metric, split, recorded and current value) and location. */
    claims: ResearchClaimAudit[]
  }>
  /** The harness's `claim scan`; `absent` when the catalog names no manuscript source. */
  unbackedNumbers: ResearchProjectFile<{
    /** Manuscript files scanned: the source and the files it `\input`s. */
    files: string[]
    /** Result-like numbers found, and how many of them a claim backs. */
    numbers: number
    backed: number
    unbacked: ResearchProjectUnbackedNumber[]
    /** Unbacked numbers past the reply cap. */
    omitted: number
  }>
  readAt: string
}
