import { hostname } from 'node:os'
import { z } from 'zod'
import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import type { ResearchGpuPolicy } from '../../shared/research/research-gpu-policy'
import type { ResearchGpuHostPolicyParams } from '../../shared/rpc-contract/research-gpu-params'
import { createResearchJsonDocumentStore } from './research-json-document-store'
import { updateResearchGpuPolicy } from './research-gpu-policy-repository'

export type ResearchGpuHostPolicyPush = z.infer<typeof ResearchGpuHostPolicyParams>

const sourceSchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.number().int().nonnegative().optional(),
    /** The desktop's name for this host, and when its limits last arrived. */
    label: z.string().nullable(),
    pushedAt: z.string().nullable()
  })
  .strict()

const sourceStore = createResearchJsonDocumentStore({
  fileName: 'gpu-policy-source.json',
  schema: sourceSchema,
  empty: () => ({ schemaVersion: 1 as const, revision: 0, label: null, pushedAt: null }),
  label: 'GPU limits source'
})

export const readResearchGpuPolicySource = sourceStore.read

/** The desktop policy with this host's entries renamed `local`, as orcad stores its own limits. */
export function withLocalHostPolicy(
  current: ResearchGpuPolicy,
  push: ResearchGpuHostPolicyPush
): ResearchGpuPolicy {
  const local = LOCAL_EXECUTION_HOST_ID
  return {
    ...current,
    hosts: [
      ...current.hosts.filter((host) => host.targetId !== local),
      ...(push.host ? [{ targetId: local, ...push.host }] : [])
    ],
    projects: [
      ...current.projects.filter((project) => project.targetId !== local),
      ...(push.host ? push.projects.map((project) => ({ targetId: local, ...project })) : [])
    ]
  }
}

/** `researchGpu.applyHostPolicy`, handled by the orcad on the host the limits are for. */
export async function applyResearchGpuHostPolicy(
  push: ResearchGpuHostPolicyPush
): Promise<{ applied: true; host: string; maxGpus: number | null; projects: number }> {
  if (process.versions.electron) {
    // Why: a desktop keeps limits per SSH host in its own Compute page, never as `local`.
    throw new Error('Only an Aster server on an SSH host takes GPU limits pushed from a desktop.')
  }
  await updateResearchGpuPolicy((current) => withLocalHostPolicy(current, push))
  await sourceStore.update((current) => ({
    ...current,
    label: push.label,
    pushedAt: new Date().toISOString()
  }))
  return {
    applied: true,
    host: hostname(),
    maxGpus: push.host?.maxGpus ?? null,
    projects: push.host ? push.projects.length : 0
  }
}
