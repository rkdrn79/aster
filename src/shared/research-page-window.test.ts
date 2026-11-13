import { describe, expect, it } from 'vitest'
import {
  parseResearchWindowChatOptions,
  parseResearchWindowLaunchResult,
  parseResearchWindowTarget,
  researchWindowQuery,
  researchWindowTargetFromSearch
} from './research-page-window'

describe('research page window targets', () => {
  it('round-trips a target through the window query', () => {
    const target = {
      page: 'research-library' as const,
      workspaceId: 'repo-1::/home/me/data/project',
      hostId: 'runtime:env-1'
    }
    const search = `?${new URLSearchParams(researchWindowQuery(target)).toString()}`

    expect(researchWindowTargetFromSearch(search)).toEqual(target)
  })

  it('keeps a workspace with no host stamp', () => {
    const search = `?${new URLSearchParams(
      researchWindowQuery({ page: 'research-writing', workspaceId: 'wt', hostId: null })
    ).toString()}`

    expect(researchWindowTargetFromSearch(search)).toEqual({
      page: 'research-writing',
      workspaceId: 'wt',
      hostId: null
    })
  })

  it.each([
    [{ page: 'terminal', workspaceId: 'wt', hostId: null }],
    [{ page: 'research-runs', workspaceId: 'wt', hostId: null }],
    [{ page: 'research-library', workspaceId: '', hostId: null }],
    [{ page: 'research-library', workspaceId: 'wt', hostId: 7 }],
    [null],
    ['research-library']
  ])('refuses %j', (value) => {
    expect(parseResearchWindowTarget(value)).toBeNull()
  })
})

describe('research window launch results', () => {
  it('accepts a started session or an error message', () => {
    expect(parseResearchWindowLaunchResult({ sessionId: 's-1' })).toEqual({ sessionId: 's-1' })
    expect(parseResearchWindowLaunchResult({ error: 'no host' })).toEqual({ error: 'no host' })
  })

  it('rejects anything else, so a bad reply cannot stand for a started chat', () => {
    expect(parseResearchWindowLaunchResult(null)).toBeNull()
    expect(parseResearchWindowLaunchResult({ sessionId: 3 })).toBeNull()
    expect(parseResearchWindowLaunchResult('started')).toBeNull()
  })
})

describe('research window chat options', () => {
  it('passes a first prompt and a title, and drops empty ones', () => {
    expect(parseResearchWindowChatOptions(undefined)).toEqual({})
    expect(parseResearchWindowChatOptions({ prompt: 'Draw it', label: 'Figure agent' })).toEqual({
      prompt: 'Draw it',
      label: 'Figure agent'
    })
    expect(parseResearchWindowChatOptions({ prompt: '', label: '' })).toEqual({})
  })

  it("carries a branch's conversation copy, and nothing else of it", () => {
    expect(
      parseResearchWindowChatOptions({
        label: 'Figure agent · branch 2',
        resumeFrom: { providerSessionId: 'copy-1', extra: true }
      })
    ).toEqual({ label: 'Figure agent · branch 2', resumeFrom: { providerSessionId: 'copy-1' } })
  })

  it.each([
    ['not an object', 'Draw it'],
    ['a prompt that is not text', { prompt: 7 }],
    ['an overlong title', { label: 'x'.repeat(513) }],
    ['an overlong prompt', { prompt: 'x'.repeat(2_000_001) }],
    ['a copy with no conversation', { resumeFrom: { providerSessionId: '' } }],
    ['a copy that is not an object', { resumeFrom: 'copy-1' }]
  ])('refuses %s', (_name, value) => {
    expect(parseResearchWindowChatOptions(value)).toBeNull()
  })
})
