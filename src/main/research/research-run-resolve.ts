import { access } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import type { z } from 'zod'
import {
  parseResearchRunName,
  RESEARCH_RECORD_ROOTS,
  researchRunPosixPaths,
  type ResearchRecordRoot,
  type ResearchRunLocation
} from '../../shared/research/research-run-reference'
import type { ResearchSlurmRunLink } from '../../shared/research/research-slurm-run-links'
import type { ResearchRunStatusParams } from '../../shared/rpc-contract/research-run-params'
import { listRegisteredSshTargets } from '../ssh/targets/ssh-target-registry'
import { findResearchSshServer } from './research-gpu-agent-api'
import { localResearchRunPath } from './research-run-files'
import {
  latestSlurmLinkForRun,
  readResearchSlurmRunLinks,
  slurmRunLinkLocation
} from './research-slurm-run-links'

export type ResolvedResearchRun = {
  location: ResearchRunLocation
  hostLabel: string | null
  link: ResearchSlurmRunLink | null
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** The nearest folder above `cwd` with `.aster/` or a pre-ADR-004 `research/` catalog. */
async function findLocalProjectRoot(cwd: string): Promise<string | null> {
  if (!isAbsolute(cwd)) {
    return null
  }
  let dir = cwd
  for (;;) {
    for (const root of RESEARCH_RECORD_ROOTS) {
      if (await exists(join(dir, root, 'project.json'))) {
        return dir
      }
    }
    const parent = dirname(dir)
    if (parent === dir) {
      return null
    }
    dir = parent
  }
}

function hostName(targetId: string | null): string {
  if (targetId === null) {
    return 'local'
  }
  return listRegisteredSshTargets().find((target) => target.id === targetId)?.label ?? targetId
}

/**
 * Explicit --server/--project first; then a job Aster linked to this Run name; then the project
 * around the caller's working directory on this machine.
 */
export async function resolveResearchRun(
  params: z.infer<typeof ResearchRunStatusParams>
): Promise<ResolvedResearchRun> {
  const name = parseResearchRunName(params.run)
  const target = params.server ? findResearchSshServer(params.server) : undefined
  if (params.server && !target) {
    throw new Error(`No SSH host named "${params.server}". Use the label shown in Aster > Compute.`)
  }
  const links = (await readResearchSlurmRunLinks().catch(() => null))?.links ?? []
  const named = links.filter(
    (link) =>
      link.experiment === name.experiment &&
      link.runId === name.runId &&
      (!target || link.targetId === target.id) &&
      (!params.project || link.projectPath === params.project)
  )
  const linked = [...named].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0]
  let location: ResearchRunLocation
  if (target) {
    const projectPath = params.project ?? linked?.projectPath
    if (!projectPath) {
      throw new Error(`Pass --project <project root on ${target.label}>.`)
    }
    location = {
      ...name,
      targetId: target.id,
      projectPath,
      ...(linked?.recordRoot && linked.projectPath === projectPath
        ? { recordRoot: linked.recordRoot }
        : {})
    }
  } else if (params.project) {
    location = linked
      ? slurmRunLinkLocation(linked)
      : { ...name, targetId: null, projectPath: params.project }
  } else if (linked) {
    location = slurmRunLinkLocation(linked)
  } else {
    const projectPath = params.cwd ? await findLocalProjectRoot(params.cwd) : null
    if (!projectPath) {
      throw new Error(
        'No .aster/project.json (or older research/project.json) above the current directory. Pass --project <project root> (and --server <host> for a Run on an SSH host).'
      )
    }
    location = { ...name, targetId: null, projectPath }
  }
  if (location.targetId === null && !isAbsolute(location.projectPath)) {
    throw new Error('--project must be an absolute path.')
  }
  return {
    location,
    hostLabel: location.targetId ? hostName(location.targetId) : null,
    link: latestSlurmLinkForRun(links, location)
  }
}

/** `recordRoot` is the tree a read found the Run in, when the location did not know it. */
export function researchRunDir(
  location: ResearchRunLocation,
  recordRoot: ResearchRecordRoot | undefined = location.recordRoot
): string {
  const known = recordRoot ? { ...location, recordRoot } : location
  return known.targetId === null
    ? localResearchRunPath(known, null)
    : researchRunPosixPaths(known).dir
}
