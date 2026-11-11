import { describe, expect, it, beforeEach, vi } from 'vitest'

const TRACK = [
  '# Track',
  '',
  'Intro.',
  '',
  '## Rebuttal',
  '',
  'Write replies.',
  '',
  '## Figures',
  '',
  'Draw with the kit.',
  '```md',
  '## Not a heading inside a fence',
  '```',
  'Check the preview.',
  '',
  '## `figures run` details',
  '',
  'Runs the script.',
  '',
  '## Rules',
  '',
  'Last.',
  ''
].join('\n')

vi.mock('./bundled-skill-guides.js', () => ({
  BUNDLED_SKILL_GUIDES: [
    {
      name: 'track',
      description: 'Use when tracking.',
      markdown: TRACK,
      fullMarkdown: TRACK,
      aliases: [],
      references: [{ name: 'gate', markdown: '# Gate\n' }]
    }
  ]
}))

vi.mock('./runtime-client', async () => {
  const { RuntimeClientError, RuntimeRpcFailureError } = await import('./runtime/types.js')
  class RuntimeClient {
    constructor() {
      throw new Error('skills get constructed a RuntimeClient')
    }
  }
  return {
    RuntimeClient,
    RuntimeClientError,
    RuntimeRpcFailureError,
    serveOrcaApp: vi.fn(),
    getDefaultUserDataPath: vi.fn(() => '/tmp/orca-user-data')
  }
})

import { main } from './index'

function stdoutText(spy: ReturnType<typeof vi.spyOn>): string {
  return spy.mock.calls.map((call) => String(call[0])).join('')
}

describe('orca skills get --section', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    process.exitCode = undefined
  })

  it('prints one section up to the next heading, ignoring headings inside code fences', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'get', 'track', '--section', 'figures'], '/tmp/repo')

    expect(stdoutText(stdoutSpy)).toBe(
      '## Figures\n\nDraw with the kit.\n```md\n## Not a heading inside a fence\n```\nCheck the preview.\n'
    )
  })

  it('prefers an exact heading and falls back to a prefix, ignoring backticks', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'get', 'track', '--section', 'figures run'], '/tmp/repo')

    expect(stdoutText(stdoutSpy)).toBe('## `figures run` details\n\nRuns the script.\n')
  })

  it('prints the last section to the end of the guide', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'get', 'track', '--section', 'Rules', '--json'], '/tmp/repo')

    expect(stdoutText(stdoutSpy)).toBe(
      `${JSON.stringify({ name: 'track', section: 'Rules', markdown: '## Rules\n\nLast.\n' }, null, 2)}\n`
    )
  })

  it('names the sections when none matches', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await main(['skills', 'get', 'track', '--section', 'Plots'], '/tmp/repo')

    expect(process.exitCode).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(
      'No section "Plots" in track. Sections: Rebuttal, Figures, `figures run` details, Rules'
    )
  })

  it('rejects --section with --reference', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await main(
      ['skills', 'get', 'track', '--section', 'Figures', '--reference', 'gate'],
      '/tmp/repo'
    )

    expect(process.exitCode).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(
      'Use --section on the guide itself, not with --reference or --references.'
    )
  })
})
