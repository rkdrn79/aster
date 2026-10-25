import { lstat, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { isDescendantOrEqual } from '../ipc/filesystem-path-containment'
import {
  researchClaimsAuditSchema,
  researchClaimsLedgerLocationsSchema,
  type ResearchClaimLocation,
  type ResearchClaimsAuditResult
} from '../../shared/research/research-harness-results'

/** Unbacked manuscript numbers handed to a client; a paper with more needs the CLI anyway. */
export const RESEARCH_UNBACKED_NUMBERS_SHOWN = 200

async function fileExists(target: string): Promise<boolean> {
  return lstat(target).then(
    (details) => details.isFile(),
    () => false
  )
}

/** A project file's real path, refused when a symlink leads outside the project. */
export async function containedProjectFile(project: string, relativePath: string): Promise<string> {
  const actual = await realpath(path.resolve(project, relativePath))
  if (!isDescendantOrEqual(actual, project) || !(await fileExists(actual))) {
    throw new Error('That file is outside this project.')
  }
  return actual
}

async function anchorLine(project: string, file: string, anchor: string): Promise<number | null> {
  try {
    const content = await readFile(await containedProjectFile(project, file), 'utf8')
    const index = content.split(/\r?\n/u).findIndex((line) => line.includes(anchor))
    return index === -1 ? null : index + 1
  } catch {
    return null
  }
}

async function claimLocations(
  project: string,
  ledger: unknown
): Promise<Map<string, ResearchClaimLocation>> {
  const { claims } = researchClaimsLedgerLocationsSchema.parse(ledger)
  const locations = new Map<string, ResearchClaimLocation>()
  for (const claim of claims) {
    const manuscript = claim.manuscript
    if (!manuscript?.file) {
      continue
    }
    const line =
      manuscript.line ??
      (manuscript.anchor ? await anchorLine(project, manuscript.file, manuscript.anchor) : null)
    locations.set(claim.id, { file: manuscript.file, line })
  }
  return locations
}

/**
 * The harness's `auditClaims` result with each claim's manuscript location: the line its stated
 * number was found on, else the line or anchor the claim recorded. `project` is canonical.
 */
export async function locateResearchClaimsAudit(
  project: string,
  rawAudit: unknown,
  listClaims: () => Promise<unknown>
): Promise<ResearchClaimsAuditResult> {
  const audit = researchClaimsAuditSchema.parse(rawAudit)
  if (!audit.exists || audit.claims.length === 0) {
    return { ...audit, claims: [] }
  }
  const locations = await claimLocations(project, await listClaims())
  return {
    ...audit,
    claims: audit.claims.map((claim) => {
      const recorded = locations.get(claim.id) ?? null
      const found = claim.manuscript?.values?.find((value) => value.found)?.line ?? null
      const file = recorded?.file ?? claim.manuscript?.file ?? null
      return {
        ...claim,
        location: file ? { file, line: found ?? recorded?.line ?? null } : null
      }
    })
  }
}
