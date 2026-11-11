import type { ResearchHomeProject, ResearchHomeWorkspace } from './research-home-projects'

/** A remote project's host as the switcher names it; null on this computer. */
export type ResearchSwitcherHost = {
  label: string
  /** "Disconnected", "Connecting"…; null while the host is reachable. */
  status: string | null
}

export type ResearchProjectSwitcherRow = {
  /** The list value; unique per project. */
  value: string
  key: string
  name: string
  badgeColor: string | null
  /** Where the project opens: its most recent workspace. */
  workspace: ResearchHomeWorkspace
  host: ResearchSwitcherHost | null
}

type SwitcherProject = Pick<ResearchHomeProject, 'key' | 'name' | 'badgeColor' | 'workspaces'>

export function projectSwitcherValue(projectKey: string): string {
  return `project:${projectKey}`
}

/**
 * The projects to jump to, most recently opened first, so the first row is the previous project.
 * The open one stays out: the sidebar already names it. `projects` arrive in recency order (see
 * buildResearchHomeProjects).
 */
export function buildProjectSwitcherRows(
  projects: readonly SwitcherProject[],
  currentKey: string | null,
  describeHost: (workspace: ResearchHomeWorkspace) => ResearchSwitcherHost | null
): ResearchProjectSwitcherRow[] {
  const rows: ResearchProjectSwitcherRow[] = []
  for (const project of projects) {
    const [workspace] = project.workspaces
    if (!workspace || project.key === currentKey) {
      continue
    }
    rows.push({
      value: projectSwitcherValue(project.key),
      key: project.key,
      name: project.name,
      badgeColor: project.badgeColor,
      workspace,
      host: describeHost(workspace)
    })
  }
  return rows
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

const WORD_START = /(^|[\s\-_./:])(\S)/g

function initials(name: string): string {
  return Array.from(name.matchAll(WORD_START), (match) => match[2]).join('')
}

/** Lower is better; null when the row does not match at all. */
export function projectSwitcherMatchRank(
  row: Pick<ResearchProjectSwitcherRow, 'name' | 'host'>,
  query: string
): number | null {
  const needle = normalize(query)
  if (!needle) {
    return 0
  }
  const name = normalize(row.name)
  if (name.startsWith(needle)) {
    return 0
  }
  const compact = needle.replace(/ /g, '')
  if (name.split(/[\s\-_./:]+/).some((word) => word.startsWith(needle))) {
    return 1
  }
  if (compact.length > 1 && initials(name).startsWith(compact)) {
    return 2
  }
  if (name.includes(needle)) {
    return 3
  }
  const host = row.host ? normalize(row.host.label) : ''
  const words = needle.split(' ')
  // Why no looser fuzzy match: "pf" would find "SparseDiff" as well as "Protein folding".
  if (words.every((word) => name.includes(word) || host.includes(word))) {
    return 4
  }
  return null
}

/** Rows that match `query`, best match first; ties keep the recency order. */
export function filterProjectSwitcherRows(
  rows: readonly ResearchProjectSwitcherRow[],
  query: string
): ResearchProjectSwitcherRow[] {
  if (!normalize(query)) {
    return rows.slice()
  }
  return rows
    .map((row, index) => ({ row, index, rank: projectSwitcherMatchRank(row, query) }))
    .filter(
      (entry): entry is { row: ResearchProjectSwitcherRow; index: number; rank: number } =>
        entry.rank !== null
    )
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map((entry) => entry.row)
}

/** The most recently opened project other than `currentKey`, or the latest one from Home. */
export function previousResearchProject<T extends Pick<ResearchHomeProject, 'key' | 'workspaces'>>(
  projects: readonly T[],
  currentKey: string | null
): T | null {
  return (
    projects.find((project) => project.key !== currentKey && project.workspaces.length > 0) ?? null
  )
}

type KeyInput = Pick<
  KeyboardEvent,
  'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'isComposing'
>

/** Keys the switcher handles itself; arrows, Enter and Escape belong to the list and popover. */
export function projectSwitcherKeyIntent(
  event: KeyInput,
  platform: NodeJS.Platform
): 'open-in-new-window' | null {
  if (event.isComposing || event.key !== 'Enter' || event.altKey || event.shiftKey) {
    return null
  }
  const mod = platform === 'darwin' ? event.metaKey && !event.ctrlKey : event.ctrlKey
  return mod ? 'open-in-new-window' : null
}
