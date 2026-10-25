import { describe, expect, it, vi } from 'vitest'
import { runMediaEntry, sampleMediaEntries } from './research-media-entries'
import { parseQualitativeOutputs } from './research-qualitative-outputs'

vi.mock('./research-file-reader', () => ({ readResearchTextFile: vi.fn() }))

function run(id: string, name: string) {
  return {
    id,
    name,
    hostId: 'local',
    workspaceId: 'workspace-1',
    workspacePath: '/project',
    outputsPath: `/project/research/experiments/sweep/runs/${name}/outputs.jsonl`
  }
}

describe('research media entries', () => {
  it('keeps blind sample cards free of Run names and paths, with one sync key per sample slot', () => {
    const [sample] = parseQualitativeOutputs(
      JSON.stringify({
        sampleId: 's-7',
        imagePath: 'research/experiments/sweep/runs/lr-3/input.png',
        media: [
          { kind: 'video', path: 'videos/s-7.mp4' },
          { kind: 'video', path: 'videos/s-7-depth.mp4', label: 'depth' },
          { kind: 'audio', path: 'audio/s-7.wav' }
        ]
      })
    ).samples
    const left = sampleMediaEntries(run('a', 'lr-3'), sample, 'Output 1')
    const right = sampleMediaEntries(run('b', 'base'), sample, 'Output 2')
    for (const entry of left) {
      const shown = [entry.caption, entry.description, entry.hint ?? ''].join(' ')
      expect(shown).not.toContain('lr-3')
      expect(shown).not.toContain('/')
    }
    expect(left.map((entry) => entry.caption)).toEqual(['Image', 'Video 1', 'depth', 'Audio'])
    expect(left[1].description).toBe('Video 1, Output 1')
    expect(left[1].paths[0]).toBe('research/experiments/sweep/runs/lr-3/videos/s-7.mp4')
    expect(left.map((entry) => entry.syncKey)).toEqual(right.map((entry) => entry.syncKey))
    expect(left[1].syncKey).not.toBe(left[2].syncKey)
    expect([left[0].syncKey, left[3].syncKey]).toEqual([undefined, undefined])
  })

  it('names the Run in mixed-Run descriptions and syncs only videos', () => {
    const item = {
      kind: 'image' as const,
      path: 'research/experiments/sweep/runs/lr-3/samples/step_200.png',
      step: 200,
      label: 'samples',
      sampleId: null,
      bytes: 10,
      source: 'exec' as const
    }
    const entry = runMediaEntry(run('a', 'lr-3'), item, { runName: true, syncKey: 'row-0' })
    expect(entry).toMatchObject({
      caption: 'step_200.png',
      description: 'lr-3, samples, step 200, step_200.png',
      hint: item.path,
      syncKey: undefined
    })
    expect(
      runMediaEntry(run('a', 'lr-3'), { ...item, kind: 'video' }, { syncKey: 'row-0' }).syncKey
    ).toBe('row-0')
  })
})
