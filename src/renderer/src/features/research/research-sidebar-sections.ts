import { useCallback, useMemo, useState } from 'react'

export type ResearchSidebarSection = 'workbench' | 'experiments' | 'writing' | 'library'
export type ResearchSidebarSections = Record<ResearchSidebarSection, boolean>

const SECTIONS: readonly ResearchSidebarSection[] = [
  'workbench',
  'experiments',
  'writing',
  'library'
]
const STORAGE_KEY = 'aster.research-sidebar-sections.v1'
const MAX_PROJECTS = 100

export const DEFAULT_RESEARCH_SIDEBAR_SECTIONS: ResearchSidebarSections = {
  workbench: true,
  experiments: true,
  writing: false,
  library: false
}

function readAll(): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? { ...parsed } : {}
  } catch {
    return {}
  }
}

/** Saved open/closed flags over the defaults; anything malformed falls back per section. */
export function parseResearchSidebarSections(value: unknown): ResearchSidebarSections {
  const sections = { ...DEFAULT_RESEARCH_SIDEBAR_SECTIONS }
  if (!value || typeof value !== 'object') {
    return sections
  }
  for (const section of SECTIONS) {
    const open: unknown = Reflect.get(value, section)
    if (typeof open === 'boolean') {
      sections[section] = open
    }
  }
  return sections
}

function readSections(projectKey: string | null): ResearchSidebarSections {
  return parseResearchSidebarSections(projectKey ? readAll()[projectKey] : null)
}

function writeSections(projectKey: string, sections: ResearchSidebarSections): void {
  const all = readAll()
  delete all[projectKey]
  all[projectKey] = sections
  const keys = Object.keys(all)
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_PROJECTS))) {
    delete all[key]
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // Why: a full storage only means the sections reopen at their defaults.
  }
}

/** Which sidebar sections are open, kept per project on this device across remounts. */
export function useResearchSidebarSections(
  projectKey: string | null
): [ResearchSidebarSections, (section: ResearchSidebarSection, open: boolean) => void] {
  const stored = useMemo(() => readSections(projectKey), [projectKey])
  const [saved, setSaved] = useState<{
    key: string | null
    sections: ResearchSidebarSections
  } | null>(null)
  const sections = saved && saved.key === projectKey ? saved.sections : stored
  const setOpen = useCallback(
    (section: ResearchSidebarSection, open: boolean) => {
      if (sections[section] === open) {
        return
      }
      const next = { ...sections, [section]: open }
      if (projectKey) {
        writeSections(projectKey, next)
      }
      setSaved({ key: projectKey, sections: next })
    },
    [projectKey, sections]
  )
  return [sections, setOpen]
}
