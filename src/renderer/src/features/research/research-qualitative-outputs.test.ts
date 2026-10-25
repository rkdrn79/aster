import { describe, expect, it, vi } from 'vitest'
import { parseQualitativeOutputs, sampleMediaFiles } from './research-qualitative-outputs'

vi.mock('./research-file-reader', () => ({ readResearchTextFile: vi.fn() }))

describe('qualitative Run outputs', () => {
  it('aligns explicit sample IDs without turning malformed or missing outputs into blank results', () => {
    const result = parseQualitativeOutputs(
      [
        JSON.stringify({ sampleId: 'case-1', prompt: 'Question?', output: 'Answer A' }),
        JSON.stringify({ sampleId: 'case-2', imagePath: '/workspace/figures/example.png' }),
        JSON.stringify({ sampleId: 'case-1', output: 'duplicate' }),
        JSON.stringify({ sampleId: 'case-3', prompt: 'no output' }),
        '{bad json}'
      ].join('\n')
    )
    expect(result.samples).toEqual([
      { sampleId: 'case-1', prompt: 'Question?', output: 'Answer A', imagePath: null, media: [] },
      {
        sampleId: 'case-2',
        prompt: null,
        output: null,
        imagePath: '/workspace/figures/example.png',
        media: []
      }
    ])
    expect(result.errorRows).toBe(3)
    expect(result.truncated).toBe(false)
  })

  it('reads sample media, taking a missing kind from the extension and rejecting unknown ones', () => {
    const result = parseQualitativeOutputs(
      [
        JSON.stringify({
          sampleId: 'clip-1',
          media: [
            { kind: 'video', path: 'videos/clip-1.mp4', label: ' generated ' },
            { path: 'audio/clip-1.WAV' },
            { kind: 'image', path: 'frames/clip-1.png', label: null }
          ]
        }),
        JSON.stringify({ sampleId: 'clip-2', media: [{ path: 'notes/clip-2.txt' }] }),
        JSON.stringify({ sampleId: 'clip-3', media: [{ kind: 'gif', path: 'a.gif' }] }),
        JSON.stringify({ sampleId: 'clip-4', media: 'videos/clip-4.mp4' }),
        JSON.stringify({ sampleId: 'clip-5', media: [] })
      ].join('\n')
    )
    expect(result.samples.map((sample) => [sample.sampleId, sample.media])).toEqual([
      [
        'clip-1',
        [
          { kind: 'video', path: 'videos/clip-1.mp4', label: 'generated' },
          { kind: 'audio', path: 'audio/clip-1.WAV', label: null },
          { kind: 'image', path: 'frames/clip-1.png', label: null }
        ]
      ]
    ])
    expect(result.errorRows).toBe(4)
  })

  it('tries the outputs folder, then the workspace root, keeping only paths inside it', () => {
    const [sample] = parseQualitativeOutputs(
      JSON.stringify({
        sampleId: 's-1',
        imagePath: 'figures/s-1.png',
        media: [
          { kind: 'video', path: 'videos/s-1.mp4' },
          { kind: 'image', path: '../../shared/input.png', label: 'input' },
          { kind: 'audio', path: '../../../../../../elsewhere/s-1.wav' },
          { kind: 'image', path: '/project/research/figures/s-1.webp' },
          { kind: 'image', path: '/elsewhere/s-1.webp' }
        ]
      })
    ).samples
    const run = {
      workspacePath: '/project',
      outputsPath: '/project/research/experiments/sweep/runs/lr-3/outputs.jsonl'
    }
    const runFolder = 'research/experiments/sweep/runs/lr-3'
    expect(sampleMediaFiles(run, sample)).toEqual([
      {
        kind: 'image',
        label: null,
        projectPaths: [`${runFolder}/figures/s-1.png`, 'figures/s-1.png']
      },
      {
        kind: 'video',
        label: null,
        projectPaths: [`${runFolder}/videos/s-1.mp4`, 'videos/s-1.mp4']
      },
      {
        kind: 'image',
        label: 'input',
        projectPaths: ['research/experiments/sweep/shared/input.png']
      },
      { kind: 'audio', label: null, projectPaths: [] },
      { kind: 'image', label: null, projectPaths: ['research/figures/s-1.webp'] },
      { kind: 'image', label: null, projectPaths: [] }
    ])
  })

  it('resolves Windows outputs folders to project paths with forward slashes', () => {
    const [sample] = parseQualitativeOutputs(
      JSON.stringify({ sampleId: 's-1', media: [{ kind: 'video', path: 'videos\\s-1.mp4' }] })
    ).samples
    const run = { workspacePath: 'C:\\project', outputsPath: 'C:\\project\\runs\\a\\outputs.jsonl' }
    expect(sampleMediaFiles(run, sample)).toEqual([
      { kind: 'video', label: null, projectPaths: ['runs/a/videos/s-1.mp4', 'videos/s-1.mp4'] }
    ])
  })
})
