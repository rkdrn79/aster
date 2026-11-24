import { RESEARCH_RECORD_ROOTS } from '../../shared/research/research-run-reference'
import type { ResearchSlurmRunLink } from '../../shared/research/research-slurm-run-links'
import { SLURM_JOB_ID_PATTERN } from '../../shared/research/research-slurm-actions'
import { listRegisteredSshTargets } from '../ssh/targets/ssh-target-registry'
import { adoptResearchSlurmRunLinks } from './research-slurm-run-links'
import { runManifestParts } from './research-run-host-paths'

export type HarnessSlurmJobCandidate = { manifestPath: string; jobId: string }

/** A link for a job `run exec` recorded from inside SLURM; the tracker fills in what it sees. */
export function harnessSlurmRunLink(
  targetId: string,
  hostLabel: string | null,
  candidate: HarnessSlurmJobCandidate,
  now: string
): ResearchSlurmRunLink | null {
  const parts = runManifestParts(candidate.manifestPath)
  const recordRoot = RESEARCH_RECORD_ROOTS.find((root) => root === parts?.recordRoot)
  if (!parts || !recordRoot || !SLURM_JOB_ID_PATTERN.test(candidate.jobId)) {
    return null
  }
  return {
    targetId,
    hostLabel,
    jobId: candidate.jobId,
    projectPath: parts.projectPath,
    experiment: parts.experiment,
    runId: parts.runId,
    recordRoot,
    submittedAt: now,
    state: 'running',
    reason: null,
    exitCode: null,
    observedAt: now,
    // Why null: run.json holds what `run exec` saw; the first tracking pass writes Aster's view.
    manifestState: null,
    manifestMessage: null,
    closedAt: null,
    origin: 'run-exec'
  }
}

/**
 * Follows the SLURM jobs of running Runs on this host, so a Run whose job ended (time limit,
 * out of memory, cancelled) is settled from sacct or squeue. Returns manifest path → job ID for
 * the jobs now followed.
 */
export async function adoptHarnessSlurmJobs(
  targetId: string,
  candidates: readonly HarnessSlurmJobCandidate[]
): Promise<Map<string, string>> {
  if (!candidates.length) {
    return new Map()
  }
  const hostLabel = listRegisteredSshTargets().find((target) => target.id === targetId)?.label
  const now = new Date().toISOString()
  const links = candidates.flatMap((candidate) => {
    const link = harnessSlurmRunLink(targetId, hostLabel ?? null, candidate, now)
    return link ? [{ candidate, link }] : []
  })
  const open = await adoptResearchSlurmRunLinks(links.map((entry) => entry.link)).catch(() => [])
  const followed = new Map<string, string>()
  for (const { candidate, link } of links) {
    if (open.some((entry) => entry.jobId === link.jobId && entry.runId === link.runId)) {
      followed.set(candidate.manifestPath, candidate.jobId)
    }
  }
  return followed
}
