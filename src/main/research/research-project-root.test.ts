import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as RepoWorktrees from '../repo-worktrees'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { Repo } from '../../shared/repo-types'
import { invalidateAuthorizedRootsCache } from '../ipc/registered-worktree-roots-cache'
import { readResearchProjectCatalog } from './research-project-catalog-read'
import { resolveResearchProjectRoot } from './research-project-files'

vi.mock('../repo-worktrees', async () => ({
  ...(await vi.importActual<typeof RepoWorktrees>('../repo-worktrees')),
  listRepoWorktreeGraph: vi.fn(async () => [])
}))

const CLI = join(import.meta.dirname, '..', '..', 'research-harness', 'cli.mjs')

let parent: string
let canonicalProject: string
let registeredProject: string

/** A runtime whose only workspace is registered at `path`, the way a project row names it. */
function runtimeFor(
  path: string
): Pick<OrcaRuntimeService, 'resolveRuntimeFileTarget' | 'requireStore'> {
  const repo: Repo = {
    id: 'repo-1',
    path,
    displayName: 'project',
    badgeColor: '#000000',
    addedAt: 1,
    kind: 'git'
  }
  const store = {
    getRepos: () => [repo],
    getProjectGroups: () => [],
    getFolderWorkspaces: () => [],
    getSettings: () => ({})
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the root reads only the worktree path, its host, and the store's roots.
  return {
    resolveRuntimeFileTarget: async () => ({ worktree: { path }, executionHostId: 'local' }),
    requireStore: () => store
  } as unknown as Pick<OrcaRuntimeService, 'resolveRuntimeFileTarget' | 'requireStore'>
}

beforeAll(async () => {
  parent = await realpath(await mkdtemp(join(tmpdir(), 'aster-research-root-')))
  canonicalProject = join(parent, 'data', 'projects', 'project')
  await mkdir(canonicalProject, { recursive: true })
  execFileSync(process.execPath, [CLI, 'init', '--project', canonicalProject], {
    cwd: canonicalProject,
    stdio: 'pipe'
  })
  // Like a cluster home whose ~/data links to /data: the row names the project through the link.
  await symlink(join(parent, 'data'), join(parent, 'home-data'), 'junction')
  registeredProject = join(parent, 'home-data', 'projects', 'project')
}, 60_000)

afterAll(async () => {
  await rm(parent, { recursive: true, force: true })
})

beforeEach(() => {
  invalidateAuthorizedRootsCache()
})

describe('resolveResearchProjectRoot', () => {
  it('reads the catalog of a workspace registered through a symlinked parent', async () => {
    const root = await resolveResearchProjectRoot(runtimeFor(registeredProject), 'id:wt')

    expect(root.path).toBe(canonicalProject)
    const catalog = await readResearchProjectCatalog(root)
    expect(catalog.file.status).toBe('present')
  })

  it('still refuses paths outside the workspace', async () => {
    const root = await resolveResearchProjectRoot(runtimeFor(registeredProject), 'id:wt')

    await expect(root.authorize(join(parent, 'data', 'projects'))).rejects.toThrow(
      /outside allowed directories/
    )
  })
})
