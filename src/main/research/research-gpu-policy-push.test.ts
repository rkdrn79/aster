import { hostname } from 'node:os'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ResearchGpuPolicy } from '../../shared/research/research-gpu-policy'

const state = vi.hoisted(() => {
  const targets: { id: string; label: string; orcadFence?: { environmentId: string } }[] = []
  const store: { policy: unknown; source: unknown } = { policy: null, source: null }
  return { targets, store }
})

vi.mock('../ssh/targets/ssh-target-registry', () => ({
  listRegisteredSshTargets: () => state.targets,
  getSshConnectionManager: () => null
}))
vi.mock('./research-gpu-policy-repository', () => ({
  readResearchGpuPolicy: async () => state.store.policy,
  updateResearchGpuPolicy: async (mutate: (current: unknown) => unknown) => {
    state.store.policy = mutate(state.store.policy)
    return state.store.policy
  }
}))
vi.mock('./research-json-document-store', () => ({
  createResearchJsonDocumentStore: (options: { empty: () => unknown }) => ({
    read: async () => state.store.source ?? options.empty(),
    update: async (mutate: (current: unknown) => unknown) => {
      state.store.source = mutate(state.store.source ?? options.empty())
      return state.store.source
    }
  })
}))
vi.mock('../ipc/runtime-environments/runtime-environment-transport-routing', () => ({
  callRuntimeEnvironment: vi.fn()
}))

const { pushResearchGpuPolicyOnce, researchGpuHostPolicyPush } =
  await import('./research-gpu-policy-push')
const { applyResearchGpuHostPolicy, withLocalHostPolicy } =
  await import('./research-gpu-host-policy')
const { readResearchGpuAgentStatus } = await import('./research-gpu-agent-api')
const { localGpuServer } = await import('./research-gpu-local-server')
const { runResearchComputeCommand } = await import('./research-compute-transport')

/** Elice-GPU's limits as the desktop keeps them, beside another host's. */
const desktopPolicy: ResearchGpuPolicy = {
  schemaVersion: 1,
  revision: 3,
  hosts: [
    { targetId: 'ssh-elice', maxGpus: 8, autoRelease: true },
    { targetId: 'ssh-vip', maxGpus: 2, autoRelease: false }
  ],
  projects: [
    {
      targetId: 'ssh-elice',
      projectKey: 'project:3d-lewam',
      projectName: '3D-LeWAM',
      maxGpus: 4,
      priority: 'high'
    },
    {
      targetId: 'ssh-vip',
      projectKey: 'project:x',
      projectName: 'X',
      maxGpus: null,
      priority: 'low'
    }
  ]
}

beforeEach(() => {
  state.targets.length = 0
  state.store.policy = null
  state.store.source = null
})

describe('GPU limits for an SSH host', () => {
  it('sends a host only its own limits, and clears them when none are left', () => {
    expect(researchGpuHostPolicyPush(desktopPolicy, 'ssh-elice', 'Elice-GPU')).toEqual({
      label: 'Elice-GPU',
      host: { maxGpus: 8, autoRelease: true },
      projects: [
        { projectKey: 'project:3d-lewam', projectName: '3D-LeWAM', maxGpus: 4, priority: 'high' }
      ]
    })
    expect(researchGpuHostPolicyPush(desktopPolicy, 'ssh-gone', 'Gone')).toEqual({
      label: 'Gone',
      host: null,
      projects: []
    })
  })

  it('stores pushed limits as this server`s own, replacing what it held before', () => {
    const empty: ResearchGpuPolicy = { schemaVersion: 1, revision: 0, hosts: [], projects: [] }
    const push = researchGpuHostPolicyPush(desktopPolicy, 'ssh-elice', 'Elice-GPU')
    const stored = withLocalHostPolicy(withLocalHostPolicy(empty, push), push)
    expect(stored.hosts).toEqual([{ targetId: 'local', maxGpus: 8, autoRelease: true }])
    expect(stored.projects.map((project) => project.targetId)).toEqual(['local'])
    expect(withLocalHostPolicy(stored, { ...push, host: null })).toMatchObject({
      hosts: [],
      projects: []
    })
  })

  it('treats an older server that lacks the method as older, not as a failure', async () => {
    state.targets.push({ id: 'ssh-elice', label: 'Elice-GPU', orcadFence: { environmentId: 'e1' } })
    state.store.policy = desktopPolicy
    const sent: unknown[] = []
    await expect(
      pushResearchGpuPolicyOnce('ssh-elice', {
        call: async (_targetId, push) => {
          sent.push(push)
          return 'method_not_found'
        }
      })
    ).resolves.toBe('older-server')
    expect(sent).toHaveLength(1)
    state.targets[0] = { id: 'ssh-elice', label: 'Elice-GPU' }
    await expect(pushResearchGpuPolicyOnce('ssh-elice', { call: async () => 'ok' })).resolves.toBe(
      'no-server'
    )
  })
})

describe('aster gpu inside orcad', () => {
  it('says where limits are set until the desktop has sent them', async () => {
    state.store.policy = { schemaVersion: 1, revision: 0, hosts: [], projects: [] }
    const status = await readResearchGpuAgentStatus({ server: undefined })
    expect(status.servers).toEqual([])
    expect(status.note).toContain('Set limits in Aster → Compute → GPU allocation.')
    expect(status.note).toContain('have reached it from Aster yet')
  })

  it('answers to its Aster name, its hostname and local once limits arrive', async () => {
    state.store.policy = { schemaVersion: 1, revision: 0, hosts: [], projects: [] }
    await applyResearchGpuHostPolicy(
      researchGpuHostPolicyPush(desktopPolicy, 'ssh-elice', 'Elice-GPU')
    )
    for (const name of ['local', 'elice-gpu', hostname()]) {
      await expect(localGpuServer(name)).resolves.toEqual({ id: 'local', label: 'Elice-GPU' })
    }
    await expect(localGpuServer('VIP')).resolves.toBeUndefined()
    await expect(readResearchGpuAgentStatus({ server: 'VIP' })).rejects.toThrow(
      /"VIP" is not this server\. On Elice-GPU, pass --server local/u
    )
  })

  it('runs SLURM commands for `local` on this host, never over SSH', async () => {
    await expect(runResearchComputeCommand('local', false, 'printf aster', 5_000)).resolves.toEqual(
      { status: 'ok', via: 'local', stdout: 'aster' }
    )
    await expect(runResearchComputeCommand('ssh-elice', false, 'true', 5_000)).resolves.toEqual({
      status: 'not-connected'
    })
  })
})
