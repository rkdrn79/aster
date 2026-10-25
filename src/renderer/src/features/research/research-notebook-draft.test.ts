// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { briefForm } from './research-experiment-brief-form'
import {
  briefFormChanges,
  restoreBriefForm,
  storedConclusionDraft
} from './research-experiment-brief-draft'
import {
  closeNotebookEditor,
  readNotebookDraft,
  writeNotebookDraft
} from './research-notebook-draft'

afterEach(() => localStorage.clear())

describe('notebook drafts', () => {
  it('keeps a changed conclusion past Esc, per Experiment, and drops an unchanged one', () => {
    const onClose = vi.fn()
    writeNotebookDraft('conclusion', 'a', { text: 'Cosine helps' })
    closeNotebookEditor({ kind: 'conclusion', experimentId: 'a', changed: true, onClose })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(storedConclusionDraft(readNotebookDraft('conclusion', 'a'))).toBe('Cosine helps')
    expect(readNotebookDraft('conclusion', 'b')).toBeNull()

    closeNotebookEditor({ kind: 'conclusion', experimentId: 'a', changed: false, onClose })
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(readNotebookDraft('conclusion', 'a')).toBeNull()
  })

  it('restores only the plan fields the user changed onto the current brief', () => {
    const opened = briefForm(null)
    const edited = { ...opened, question: 'Does cosine help?' }
    writeNotebookDraft('plan', 'a', { changes: briefFormChanges(edited, opened) })
    // An agent set the metric meanwhile; the draft must not revert it.
    const current = { ...opened, metricName: 'psnr' }
    expect(restoreBriefForm(current, readNotebookDraft('plan', 'a'))).toEqual({
      ...current,
      question: 'Does cosine help?'
    })
    expect(restoreBriefForm(current, { changes: { status: 'nonsense' } })).toBeNull()
    expect(restoreBriefForm(current, { changes: {} })).toBeNull()
  })
})
