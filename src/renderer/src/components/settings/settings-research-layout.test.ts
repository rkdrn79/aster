import { describe, expect, it } from 'vitest'
import { buildSettingsNavigationMetadata } from '@/hooks/useSettingsNavigationMetadata'
import {
  CODE_WORKSPACE_NAV_GROUP_ID,
  defaultSettingsSectionId,
  isCodeWorkspaceGroupExpanded
} from './settings-research-layout'
import { leadWithShortcutGroup } from './shortcut-groups'

function navigation(researchLayout: boolean) {
  return buildSettingsNavigationMetadata({
    isMac: true,
    isWindows: false,
    isWebClient: false,
    nativeChatEnabled: true,
    isDev: false,
    repos: [],
    researchLayout
  })
}

describe('Research layout settings', () => {
  it('leads with the Research pane and lands on it', () => {
    const sections = navigation(true)
    expect(sections[0]).toMatchObject({ id: 'research', group: 'research' })
    expect(defaultSettingsSectionId(true)).toBe('research')
  })

  it('moves Code-only panes into the Code workspace group after the research panes', () => {
    const sections = navigation(true)
    const codeWorkspace = sections.filter(
      (section) => section.group === CODE_WORKSPACE_NAV_GROUP_ID
    )
    expect(codeWorkspace.map((section) => section.id)).toEqual(
      expect.arrayContaining(['general', 'git', 'terminal'])
    )
    const firstCodeIndex = sections.findIndex(
      (section) => section.group === CODE_WORKSPACE_NAV_GROUP_ID
    )
    expect(
      sections.slice(firstCodeIndex).every((s) => s.group === CODE_WORKSPACE_NAV_GROUP_ID)
    ).toBe(true)
    const shown = new Set(sections.map((section) => section.id))
    for (const id of ['agents', 'appearance', 'shortcuts', 'ssh']) {
      expect(shown.has(id)).toBe(true)
    }
    // Worktree-only tooling stays out of the Research layout entirely.
    for (const id of ['browser', 'quick-commands', 'automations', 'plugins']) {
      expect(shown.has(id)).toBe(false)
    }
  })

  it('leaves the Code layout without a Research pane or Code workspace group', () => {
    const sections = navigation(false)
    expect(sections.some((section) => section.id === 'research')).toBe(false)
    expect(sections.some((section) => section.group === CODE_WORKSPACE_NAV_GROUP_ID)).toBe(false)
    expect(sections.find((section) => section.id === 'general')?.group).toBe('setup')
    expect(defaultSettingsSectionId(false)).toBe('general')
  })

  it('opens the collapsed Code workspace group for a search or an active pane inside it', () => {
    const base = { toggledOpen: false, searching: false, activeSectionId: 'research' }
    const groupSectionIds = ['general', 'git']
    expect(isCodeWorkspaceGroupExpanded({ ...base, groupSectionIds })).toBe(false)
    expect(isCodeWorkspaceGroupExpanded({ ...base, groupSectionIds, searching: true })).toBe(true)
    expect(isCodeWorkspaceGroupExpanded({ ...base, groupSectionIds, activeSectionId: 'git' })).toBe(
      true
    )
  })

  it('lists the Research shortcut group first without reordering the rest', () => {
    const groups = ['Global', 'Research', 'Terminal'].map((title) => ({ title, items: [] }))
    expect(leadWithShortcutGroup(groups, 'Research').map((group) => group.title)).toEqual([
      'Research',
      'Global',
      'Terminal'
    ])
    expect(leadWithShortcutGroup(groups, undefined)).toEqual(groups)
  })
})
