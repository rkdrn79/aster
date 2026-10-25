import { lstat } from 'node:fs/promises'
import {
  auditClaims,
  listClaims,
  scanUnbackedNumbers
} from '../../research-harness/research-claims.mjs'
import { researchUnbackedNumbersSchema } from '../../shared/research/research-harness-results'
import {
  RESEARCH_PROJECT_API_VERSION,
  type ResearchProjectFile
} from '../../shared/research/research-project-api'
import type { ResearchProjectClaimsAuditResult } from '../../shared/research/research-project-claims-api'
import { isENOENT } from '../ipc/filesystem-path-containment'
import { locateResearchClaimsAudit, RESEARCH_UNBACKED_NUMBERS_SHOWN } from './research-claims-audit'
import { readResearchProjectCatalog } from './research-project-catalog-read'
import {
  resolveResearchWorkspacePath,
  unreadableResearchProjectFile,
  type ResearchProjectRoot
} from './research-project-files'

type ClaimsAudit = ResearchProjectClaimsAuditResult['claims']
type UnbackedNumbers = ResearchProjectClaimsAuditResult['unbackedNumbers']

// Why: the harness passes fs errors through, so a missing claims or manuscript file stays ENOENT.
function absentOrUnreadable(
  error: unknown
): { status: 'absent' } | { status: 'unreadable'; reason: string } {
  return isENOENT(error) ? { status: 'absent' } : unreadableResearchProjectFile(error)
}

async function statPdf(
  root: ResearchProjectRoot,
  pdf: string | null
): Promise<ResearchProjectFile<{ bytes: number; modifiedAt: string }>> {
  if (!pdf) {
    return { status: 'absent' }
  }
  try {
    const details = await lstat(await resolveResearchWorkspacePath(root, pdf))
    return details.isFile()
      ? {
          status: 'present',
          value: { bytes: details.size, modifiedAt: details.mtime.toISOString() }
        }
      : { status: 'unreadable', reason: `${pdf} is not a file.` }
  } catch (error) {
    return absentOrUnreadable(error)
  }
}

async function readAudit(root: ResearchProjectRoot): Promise<ClaimsAudit> {
  try {
    const audit = await locateResearchClaimsAudit(root.path, await auditClaims(root.path), () =>
      listClaims(root.path)
    )
    return audit.exists
      ? { status: 'present', value: { summary: audit.summary, claims: audit.claims } }
      : { status: 'absent' }
  } catch (error) {
    return absentOrUnreadable(error)
  }
}

async function readUnbacked(
  root: ResearchProjectRoot,
  source: string | null
): Promise<UnbackedNumbers> {
  if (!source) {
    return { status: 'absent' }
  }
  try {
    const scan = researchUnbackedNumbersSchema.parse(await scanUnbackedNumbers(root.path))
    return {
      status: 'present',
      value: {
        files: scan.files,
        numbers: scan.numbers,
        backed: scan.backed,
        unbacked: scan.unbacked
          .slice(0, RESEARCH_UNBACKED_NUMBERS_SHOWN)
          .map(({ text, file, line, context }) => ({ text, file, line, context })),
        omitted: Math.max(0, scan.unbacked.length - RESEARCH_UNBACKED_NUMBERS_SHOWN)
      }
    }
  } catch (error) {
    return absentOrUnreadable(error)
  }
}

/** The harness's claim audit and unbacked-number scan, run in-process on the workspace's host. */
export async function readResearchProjectClaimsAudit(
  root: ResearchProjectRoot
): Promise<ResearchProjectClaimsAuditResult> {
  const catalog = await readResearchProjectCatalog(root)
  const manuscript = catalog.file.status === 'present' ? catalog.file.value.manuscript : null
  const source = manuscript?.source ?? null
  const pdf = manuscript?.pdf ?? null
  const [pdfFile, claims, unbackedNumbers] = await Promise.all([
    statPdf(root, pdf),
    readAudit(root),
    readUnbacked(root, source)
  ])
  return {
    version: RESEARCH_PROJECT_API_VERSION,
    catalog: catalog.file.status,
    manuscript: { source, pdf, pdfFile },
    claims,
    unbackedNumbers,
    readAt: new Date().toISOString()
  }
}
