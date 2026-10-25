import { describe, expect, it } from 'vitest'
import type { ResearchExperimentBrief } from '../../../../shared/research/research-experiment-brief'
import { briefForm, briefFormPatch } from './research-experiment-brief-form'

const saved: ResearchExperimentBrief = {
  question: 'Does r16 match full fine-tuning?',
  hypothesis: null,
  status: 'running',
  primaryMetric: { name: 'acc', split: 'val', direction: 'maximize' },
  evaluation: { datasetId: 'sst2', datasetRevision: null, split: 'val', evaluatorRevision: null },
  baseline: 'lora/full-ft',
  minSeeds: 3,
  rubric: null,
  agentPolicy: { triage: 'suggest', proposals: 'approval' },
  conclusion: null,
  updatedAt: '2026-10-24T00:00:00.000Z',
  updatedBy: 'agent'
}

describe('briefFormPatch', () => {
  it('sends only changed fields so concurrent agent edits to others survive', () => {
    expect(briefFormPatch(briefForm(saved), saved)).toEqual({ patch: {} })
    const form = { ...briefForm(saved), baseline: '', evaluationSplit: 'test', minSeeds: '5' }
    expect(briefFormPatch(form, saved)).toEqual({
      patch: {
        evaluation: {
          datasetId: 'sst2',
          datasetRevision: null,
          split: 'test',
          evaluatorRevision: null
        },
        baseline: null,
        minSeeds: 5
      }
    })
  })

  it('treats an absent brief as defaults and refuses details the harness would reject', () => {
    expect(briefFormPatch({ ...briefForm(null), question: '  Why?  ' }, null)).toEqual({
      patch: { question: 'Why?' }
    })
    expect(briefFormPatch({ ...briefForm(null), evaluationSplit: 'val' }, null)).toEqual({
      error: 'Add a dataset ID for the evaluation details.'
    })
    expect(briefFormPatch({ ...briefForm(null), minSeeds: '2.5' }, null)).toEqual({
      error: 'Min seeds must be a whole number from 1 to 20.'
    })
  })
})
