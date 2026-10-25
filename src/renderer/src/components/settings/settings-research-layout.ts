import type { SettingsNavSection } from '@/lib/settings-navigation-types'

export const RESEARCH_SETTINGS_SECTION_ID = 'research'
export const CODE_WORKSPACE_NAV_GROUP_ID = 'code-workspace'

// Why: a researcher's settings are papers, runs, agents and compute; these keep their usual groups.
const RESEARCH_LAYOUT_SECTION_IDS: ReadonlySet<string> = new Set([
  RESEARCH_SETTINGS_SECTION_ID,
  'agents',
  'accounts',
  'appearance',
  'chat',
  'input',
  'notifications',
  'shortcuts',
  'stats',
  'ssh',
  'servers'
])

// Why: worktree, terminal and source-control panes still matter when a project needs code work.
const CODE_WORKSPACE_SECTION_IDS: ReadonlySet<string> = new Set([
  'general',
  'mobile',
  'session-history',
  'git',
  'terminal'
])

/**
 * Settings panes in nav order for the active layout. The Research layout leads with the Research
 * pane, keeps research-relevant panes in their groups, moves Code-only panes into one
 * "Code workspace" group, and hides the rest; the Code layout never shows the Research pane.
 */
export function arrangeSettingsSectionsForLayout(
  sections: readonly SettingsNavSection[],
  researchLayout: boolean
): SettingsNavSection[] {
  if (!researchLayout) {
    return sections.filter((section) => section.id !== RESEARCH_SETTINGS_SECTION_ID)
  }
  const research = sections.filter((section) => section.id === RESEARCH_SETTINGS_SECTION_ID)
  const primary = sections.filter(
    (section) =>
      section.id !== RESEARCH_SETTINGS_SECTION_ID && RESEARCH_LAYOUT_SECTION_IDS.has(section.id)
  )
  const codeWorkspace = sections
    .filter((section) => CODE_WORKSPACE_SECTION_IDS.has(section.id))
    .map((section) => ({ ...section, group: CODE_WORKSPACE_NAV_GROUP_ID }))
  const projects = sections.filter((section) => section.id.startsWith('repo-'))
  return [...research, ...primary, ...codeWorkspace, ...projects]
}

export function defaultSettingsSectionId(researchLayout: boolean): string {
  return researchLayout ? RESEARCH_SETTINGS_SECTION_ID : 'general'
}

/** Whether the collapsible Code workspace group shows its panes. */
export function isCodeWorkspaceGroupExpanded(args: {
  toggledOpen: boolean
  searching: boolean
  activeSectionId: string
  groupSectionIds: readonly string[]
}): boolean {
  return args.toggledOpen || args.searching || args.groupSectionIds.includes(args.activeSectionId)
}
