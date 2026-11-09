import { useEffect, useState } from 'react'
import { hostRouteForAuthority } from '@/runtime/runtime-client-target'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client-types'
import { writeRuntimeFile } from '@/runtime/runtime-file-mutation-client'
import { readRuntimeFileContent } from '@/runtime/runtime-file-read-client'
import { resolveRuntimePath } from '../../../../shared/cross-platform-path'
import { getDiskBaselineSignature } from '../../../../shared/disk-baseline-signature'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import { parseHostAuthorityKey } from '../../../../shared/host-authority'
import { RESEARCH_RECORD_ROOTS } from '../../../../shared/research/research-run-reference'
import {
  catalogTextWithWandb,
  researchProjectWandbSchema,
  type ResearchProjectWandb
} from '../../../../shared/research/research-wandb'

/** The workspace whose catalog holds the setting; Experiment and Run records carry the same fields. */
export type ResearchWandbOwner = { hostId: string; workspaceId: string; workspacePath: string }

export type ProjectWandbCatalog =
  | { status: 'present'; path: string; text: string; settings: ResearchProjectWandb | null }
  | { status: 'missing'; reason: string }

// Why: links appear on every Run and Experiment page; one read per project is plenty.
const CACHE_MS = 30_000
const cache = new Map<string, { at: number; value: Promise<ResearchProjectWandb | null> }>()
const listeners = new Set<() => void>()

function ownerKey(owner: ResearchWandbOwner): string {
  return JSON.stringify([owner.hostId, owner.workspaceId, owner.workspacePath])
}

/** The same transport the editor uses: this machine, an SSH target, or the owning server. */
function catalogFileContext(owner: ResearchWandbOwner): RuntimeFileOperationArgs {
  const authority = parseHostAuthorityKey(owner.hostId)
  if (!authority || (authority.endpoint.kind === 'environment' && authority.at !== 'local')) {
    throw new Error('This host does not support project settings.')
  }
  const ssh = authority.endpoint.kind === 'self' ? parseExecutionHostId(authority.at) : null
  return {
    target: hostRouteForAuthority(authority).target,
    worktreeId: owner.workspaceId,
    worktreePath: owner.workspacePath,
    ...(ssh?.kind === 'ssh' ? { connectionId: ssh.targetId } : {})
  }
}

function access(owner: ResearchWandbOwner) {
  return { kind: 'research-workspace' as const, workspacePath: owner.workspacePath }
}

export function parseCatalogWandb(text: string): ResearchProjectWandb | null {
  const catalog: unknown = JSON.parse(text)
  if (!catalog || typeof catalog !== 'object' || !('wandb' in catalog)) {
    return null
  }
  const parsed = researchProjectWandbSchema.safeParse(catalog.wandb)
  return parsed.success ? parsed.data : null
}

/** `.aster/project.json`, else a pre-ADR-004 `research/project.json`, as raw text. */
export async function readProjectWandbCatalog(
  owner: ResearchWandbOwner
): Promise<ProjectWandbCatalog> {
  const context = catalogFileContext(owner)
  let reason = 'This project has no .aster/project.json yet. Set up its research folders first.'
  for (const root of RESEARCH_RECORD_ROOTS) {
    const relativePath = `${root}/project.json`
    const filePath = resolveRuntimePath(owner.workspacePath, relativePath)
    try {
      const file = await readRuntimeFileContent({
        target: context.target,
        filePath,
        relativePath,
        worktreeId: owner.workspaceId,
        connectionId: context.connectionId,
        access: access(owner)
      })
      if (file.isBinary) {
        continue
      }
      return {
        status: 'present',
        path: filePath,
        text: file.content,
        settings: parseCatalogWandb(file.content)
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      // Why: a missing .aster catalog falls through to the legacy one; anything else is worth showing.
      if (root === RESEARCH_RECORD_ROOTS[0] && !/ENOENT|not found|no such file/iu.test(message)) {
        reason = `Could not read ${relativePath}: ${message}`
      }
    }
  }
  return { status: 'missing', reason }
}

/** Writes the `wandb` section into the catalog it was read from; refuses if the file changed. */
export async function saveProjectWandbSettings(
  owner: ResearchWandbOwner,
  settings: ResearchProjectWandb
): Promise<void> {
  const catalog = await readProjectWandbCatalog(owner)
  if (catalog.status !== 'present') {
    throw new Error(catalog.reason)
  }
  const written = await writeRuntimeFile(
    catalogFileContext(owner),
    catalog.path,
    catalogTextWithWandb(catalog.text, settings),
    access(owner),
    { expectedSignature: getDiskBaselineSignature(catalog.text) }
  )
  if (!written.ok) {
    throw new Error('The project catalog changed while saving. Try again.')
  }
  cache.delete(ownerKey(owner))
  for (const listener of listeners) {
    listener()
  }
}

export function loadProjectWandbSettings(
  owner: ResearchWandbOwner
): Promise<ResearchProjectWandb | null> {
  const key = ownerKey(owner)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return hit.value
  }
  const value = readProjectWandbCatalog(owner).then(
    (catalog) => (catalog.status === 'present' ? catalog.settings : null),
    () => null
  )
  cache.set(key, { at: Date.now(), value })
  return value
}

/** The project's W&B setting for links; null while reading, when absent, or unreadable. */
export function useProjectWandbSettings(
  owner: ResearchWandbOwner | null | undefined
): ResearchProjectWandb | null {
  const [saved, setSaved] = useState(0)
  const [state, setState] = useState<{ key: string; settings: ResearchProjectWandb | null }>()
  const hostId = owner?.hostId
  const workspaceId = owner?.workspaceId
  const workspacePath = owner?.workspacePath
  const key = owner ? ownerKey(owner) : null
  useEffect(() => {
    const listener = (): void => setSaved((count) => count + 1)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])
  useEffect(() => {
    if (!hostId || !workspaceId || !workspacePath) {
      return
    }
    const current = { hostId, workspaceId, workspacePath }
    let active = true
    void loadProjectWandbSettings(current).then((settings) => {
      if (active) {
        setState({ key: ownerKey(current), settings })
      }
    })
    return () => {
      active = false
    }
  }, [hostId, workspaceId, workspacePath, saved])
  return state && state.key === key ? state.settings : null
}
