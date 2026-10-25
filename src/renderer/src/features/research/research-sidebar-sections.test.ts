import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RESEARCH_SIDEBAR_SECTIONS,
  parseResearchSidebarSections
} from './research-sidebar-sections'

describe('parseResearchSidebarSections', () => {
  it('opens Workbench and Experiments by default and keeps each saved flag over it', () => {
    expect(DEFAULT_RESEARCH_SIDEBAR_SECTIONS).toEqual({
      workbench: true,
      experiments: true,
      writing: false,
      library: false
    })
    expect(parseResearchSidebarSections(null)).toEqual(DEFAULT_RESEARCH_SIDEBAR_SECTIONS)
    expect(
      parseResearchSidebarSections({ experiments: false, writing: true, library: 'yes' })
    ).toEqual({ workbench: true, experiments: false, writing: true, library: false })
  })
})
