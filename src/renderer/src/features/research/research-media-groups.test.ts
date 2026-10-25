import { describe, expect, it } from 'vitest'
import type { ResearchRunMediaItem } from '../../../../shared/research/research-run-media'
import {
  alignedMediaRows,
  chosenMediaCompareKey,
  groupMediaByLabel,
  latestMediaStep,
  mediaCompareLabels,
  sharedMediaCompareKey
} from './research-media-groups'

function media(
  path: string,
  fields: Partial<Omit<ResearchRunMediaItem, 'path'>> = {}
): ResearchRunMediaItem {
  return {
    kind: 'image',
    path,
    step: null,
    label: null,
    sampleId: null,
    bytes: null,
    source: 'exec',
    ...fields
  }
}

describe('research media grouping', () => {
  it('groups by label in name order, unlabeled last, then by step with "no step" first', () => {
    const groups = groupMediaByLabel([
      media('a/10.png', { label: 'samples', step: 10 }),
      media('a/clip.mp4', { kind: 'video' }),
      media('a/2.png', { label: 'samples', step: 2 }),
      media('a/attn.png', { label: 'Attention', step: 2 }),
      media('a/x.png', { label: 'samples' }),
      media('a/10b.png', { label: 'samples', step: 10 })
    ])
    expect(groups.map((group) => [group.label, group.steps, group.count])).toEqual([
      ['Attention', [2], 1],
      ['samples', [null, 2, 10], 4],
      [null, [null], 1]
    ])
    expect(groups[1].itemsByStep.get(10)?.map((item) => item.path)).toEqual([
      'a/10.png',
      'a/10b.png'
    ])
    expect(latestMediaStep(groups[1].steps)).toBe(10)
    expect(latestMediaStep([null])).toBeNull()
  })

  it('defaults a comparison to the latest step every Run shares', () => {
    const labels = mediaCompareLabels([
      {
        runId: 'base',
        items: [
          media('b/100.png', { label: 'samples', step: 100 }),
          media('b/200.png', { label: 'samples', step: 200 }),
          media('b/300.png', { label: 'samples', step: 300 }),
          media('b/val.mp4', { kind: 'video', label: 'rollout', step: 300 })
        ]
      },
      {
        runId: 'lr-3',
        items: [
          media('c/100.png', { label: 'samples', step: 100 }),
          media('c/200.png', { label: 'samples', step: 200 })
        ]
      }
    ])
    expect(labels).toEqual([
      { label: 'rollout', steps: [300], sharedSteps: [] },
      { label: 'samples', steps: [100, 200, 300], sharedSteps: [100, 200] }
    ])
    expect(sharedMediaCompareKey(labels)).toEqual({ label: 'samples', step: 200 })
    expect(sharedMediaCompareKey(labels.slice(0, 1))).toBeNull()
    expect(chosenMediaCompareKey(labels.slice(0, 1), null)).toEqual({ label: 'rollout', step: 300 })
    expect(chosenMediaCompareKey(labels, { label: 'samples', step: 300 })).toEqual({
      label: 'samples',
      step: 300
    })
    expect(chosenMediaCompareKey(labels, { label: 'samples', step: 50 })).toEqual({
      label: 'samples',
      step: 200
    })
  })

  it('pairs files across Runs by sample ID when all have one, else by position', () => {
    const key = { label: 'samples', step: 5 }
    const withIds = alignedMediaRows(
      [
        {
          runId: 'base',
          items: [
            media('b/s2.png', { label: 'samples', step: 5, sampleId: 's-2' }),
            media('b/s1.png', { label: 'samples', step: 5, sampleId: 's-1' })
          ]
        },
        {
          runId: 'lr-3',
          items: [media('c/s2.png', { label: 'samples', step: 5, sampleId: 's-2' })]
        }
      ],
      key
    )
    expect(withIds.map((row) => row.map((item) => item?.path ?? null))).toEqual([
      ['b/s1.png', null],
      ['b/s2.png', 'c/s2.png']
    ])
    const byPosition = alignedMediaRows(
      [
        {
          runId: 'base',
          items: [
            media('b/1.png', { label: 'samples', step: 5 }),
            media('b/0.png', { label: 'samples', step: 5 }),
            media('b/0.png.other', { label: 'samples', step: 6 })
          ]
        },
        { runId: 'lr-3', items: [media('c/0.png', { label: 'samples', step: 5 })] }
      ],
      key
    )
    expect(byPosition.map((row) => row.map((item) => item?.path ?? null))).toEqual([
      ['b/0.png', 'c/0.png'],
      ['b/1.png', null]
    ])
  })
})
