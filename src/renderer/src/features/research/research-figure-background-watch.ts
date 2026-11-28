import { figureWorkFolder } from '../../../../research-harness/research-figures-locations.mjs'
import {
  FIGURE_SCENE_EXTENSION,
  figureRendererPath,
  figuresFolderFor,
  isFigureSlug
} from '../../../../research-harness/research-figures-model.mjs'
import type { FigureTarget } from './research-figures-export'
import {
  deleteProjectPath,
  listProjectDirectory,
  projectFileSignature,
  projectOwnerKey,
  readProjectText,
  writeProjectText,
  type ProjectFileOwner
} from './research-project-files'

/** How often a project is looked at: often while an agent is drawing in it, rarely otherwise. */
export const WATCH_HOT_MS = 2000
export const WATCH_COLD_MS = 15_000
// Why sooner on this computer: a look here is a few local reads, not round trips to a server.
const WATCH_COLD_LOCAL_MS = 5000
const HOT_FOR_MS = 5 * 60_000
const FOLDERS_EVERY_MS = 60_000
// Why a minute: an agent may set a project up (figures new) and wait on its first preview.
const NOT_RESEARCH_EVERY_MS = 60_000
/** The stamp `figures preview` reads to tell "Aster is rendering" from "Aster is not connected". */
export const RENDERER_STAMP_EVERY_MS = 30_000
const REQUEST_SUFFIX = '.request.json'

export type FigureRenderRequest = { target: FigureTarget; priority: number; delayMs?: number }

type Project = {
  owner: ProjectFileOwner
  recordRoot: string | null
  folders: string[] | null
  foldersAt: number
  scenes: Map<string, string>
  hotUntil: number
  nextAt: number
  stampAt: number
  failures: number
  busy: boolean
  /** The cache folder keeps its `*` .gitignore, so nothing Aster stamps there is committed. */
  ignored: boolean
}

async function readJson(owner: ProjectFileOwner, path: string): Promise<unknown> {
  try {
    return JSON.parse(await readProjectText(owner, path))
  } catch {
    return null
  }
}

/** A research project's figure folders (its working one, and the one beside the manuscript). */
async function figureFolders(
  owner: ProjectFileOwner
): Promise<{ recordRoot: string; folders: string[] } | null> {
  for (const root of ['.aster', 'research']) {
    const entries = await listProjectDirectory(owner, root)
    if (!entries?.some((entry) => entry.name === 'project.json' && !entry.isDirectory)) {
      continue
    }
    const catalog = await readJson(owner, `${root}/project.json`)
    const manuscript =
      catalog && typeof catalog === 'object' ? Reflect.get(catalog, 'manuscript') : null
    const source =
      manuscript && typeof manuscript === 'object' ? Reflect.get(manuscript, 'source') : null
    let paper = 'paper/figures'
    try {
      paper = figuresFolderFor(typeof source === 'string' ? source : 'paper/main.tex')
    } catch {
      paper = 'paper/figures'
    }
    const work = figureWorkFolder(root)
    return { recordRoot: root, folders: work === paper ? [work] : [work, paper] }
  }
  return null
}

/**
 * Looks after every research project Aster knows for figures whose preview lags their scene: an
 * agent's script run, a hand-written JSON, or a harness asking for a render. Hands them to `render`
 * and stamps each project so the harness knows previews are on their way.
 */
export function createFigureBackgroundWatch(options: {
  render: (request: FigureRenderRequest) => void
  now?: () => number
}) {
  const now = options.now ?? Date.now
  const projects = new Map<string, Project>()

  function setProjects(owners: readonly ProjectFileOwner[]): void {
    const keep = new Set<string>()
    for (const owner of owners) {
      const key = projectOwnerKey(owner)
      keep.add(key)
      if (!projects.has(key)) {
        projects.set(key, {
          owner,
          recordRoot: null,
          folders: null,
          foldersAt: 0,
          scenes: new Map(),
          hotUntil: 0,
          nextAt: 0,
          stampAt: 0,
          failures: 0,
          busy: false,
          ignored: false
        })
      }
    }
    for (const key of projects.keys()) {
      if (!keep.has(key)) {
        projects.delete(key)
      }
    }
  }

  async function stamp(project: Project, at: number): Promise<void> {
    if (!project.recordRoot || at - project.stampAt < RENDERER_STAMP_EVERY_MS) {
      return
    }
    project.stampAt = at
    const cache = `${project.recordRoot}/cache/figures`
    if (!project.ignored) {
      const entries = await listProjectDirectory(project.owner, cache)
      if (!entries?.some((entry) => entry.name === '.gitignore')) {
        await writeProjectText(project.owner, `${cache}/.gitignore`, '*\n')
      }
      project.ignored = true
    }
    const text = `${JSON.stringify({ renderer: 'aster-desktop', at: new Date(at).toISOString(), everyMs: RENDERER_STAMP_EVERY_MS })}\n`
    await writeProjectText(project.owner, figureRendererPath(project.recordRoot), text)
  }

  async function lookAt(project: Project): Promise<void> {
    const at = now()
    if (!project.folders || at - project.foldersAt >= FOLDERS_EVERY_MS) {
      const found = await figureFolders(project.owner)
      project.foldersAt = at
      project.recordRoot = found?.recordRoot ?? null
      project.folders = found?.folders ?? []
    }
    if (!project.recordRoot) {
      project.nextAt = at + NOT_RESEARCH_EVERY_MS
      return
    }
    let changed = false
    for (const folder of project.folders ?? []) {
      const entries = (await listProjectDirectory(project.owner, folder)) ?? []
      for (const entry of entries) {
        const slug = entry.name.slice(0, -FIGURE_SCENE_EXTENSION.length)
        if (
          entry.isDirectory ||
          !entry.name.endsWith(FIGURE_SCENE_EXTENSION) ||
          !isFigureSlug(slug)
        ) {
          continue
        }
        const path = `${folder}/${entry.name}`
        const { signature } = await projectFileSignature(project.owner, path)
        const known = project.scenes.get(path)
        if (known === signature) {
          continue
        }
        project.scenes.set(path, signature)
        changed ||= known !== undefined
        // Why a first look renders low and at once: only what lags its scene gets drawn.
        options.render({
          target: { owner: project.owner, folder, slug },
          priority: known === undefined ? 0 : 1,
          ...(known === undefined ? { delayMs: 0 } : {})
        })
      }
    }
    // Why only with figures: most research projects have none, and each stamp is a write.
    if (project.scenes.size) {
      await stamp(project, at)
    }
    changed = (await takeRequests(project)) || changed
    if (changed) {
      project.hotUntil = at + HOT_FOR_MS
    }
    const cold = project.owner.hostId === 'local' ? WATCH_COLD_LOCAL_MS : WATCH_COLD_MS
    project.nextAt = now() + (project.hotUntil > now() ? WATCH_HOT_MS : cold)
  }

  /** `figures preview` asked: render that figure first. */
  async function takeRequests(project: Project): Promise<boolean> {
    const cache = `${project.recordRoot}/cache/figures`
    const entries = (await listProjectDirectory(project.owner, cache)) ?? []
    let found = false
    for (const entry of entries) {
      const slug = entry.name.slice(0, -REQUEST_SUFFIX.length)
      if (!entry.name.endsWith(REQUEST_SUFFIX) || !isFigureSlug(slug)) {
        continue
      }
      const path = [...project.scenes.keys()].find((scene) =>
        scene.endsWith(`/${slug}${FIGURE_SCENE_EXTENSION}`)
      )
      await deleteProjectPath(project.owner, `${cache}/${entry.name}`).catch(() => undefined)
      if (path) {
        found = true
        options.render({
          target: { owner: project.owner, folder: path.slice(0, path.lastIndexOf('/')), slug },
          priority: 2,
          delayMs: 0
        })
      }
    }
    return found
  }

  /** Looks at every project that is due; one look per project at a time. */
  function tick(): void {
    const at = now()
    for (const project of projects.values()) {
      if (project.busy || project.nextAt > at) {
        continue
      }
      project.busy = true
      void lookAt(project)
        .then(
          () => {
            project.failures = 0
          },
          () => {
            // Why back off: a disconnected host fails every look until it is back.
            project.failures += 1
            project.nextAt = now() + Math.min(5 * 60_000, WATCH_COLD_MS * 2 ** project.failures)
          }
        )
        .finally(() => {
          project.busy = false
        })
    }
  }

  return {
    setProjects,
    tick,
    /** An agent is drawing in this project: look at it often for a while. */
    markHot: (owner: ProjectFileOwner) => {
      const project = projects.get(projectOwnerKey(owner))
      if (project) {
        project.hotUntil = now() + HOT_FOR_MS
        project.nextAt = Math.min(project.nextAt, now())
      }
    }
  }
}
