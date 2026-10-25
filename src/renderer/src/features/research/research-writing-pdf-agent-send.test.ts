import { describe, expect, it, vi } from 'vitest'
import type { PdfTextSelection } from '@/components/editor/pdf-text-selection'
import {
  buildWritingPdfRevisionPrompt,
  sendWritingPdfRevision,
  type PdfRevisionSource
} from './research-writing-pdf-agent-send'

const source: PdfRevisionSource = {
  workspaceId: 'worktree-1',
  workspacePath: '/research/paper',
  pdfFile: { absolutePath: '/research/paper/paper/main.pdf', relativePath: 'paper/main.pdf' },
  mainTeXFile: { absolutePath: '/research/paper/paper/main.tex', relativePath: 'paper/main.tex' },
  currentTeXFile: {
    absolutePath: '/research/paper/paper/section.tex',
    relativePath: 'paper/section.tex'
  }
}
const selection: PdfTextSelection = {
  text: 'A revised conclusion.',
  pageNumber: 4,
  anchor: { x: 100, y: 200 }
}

describe('PDF Writing revision request', () => {
  it('identifies the PDF page and treats TeX paths as unverified hints', () => {
    const prompt = buildWritingPdfRevisionPrompt(source, selection, 'Make the claim more precise.')
    expect(prompt).toContain('paper/main.pdf" (page 4)')
    expect(prompt).toContain('paper/main.tex')
    expect(prompt).toContain('paper/section.tex')
    expect(prompt).toContain('A revised conclusion.')
    expect(prompt).toContain(
      'If the source is missing, duplicated, or ambiguous, do not edit any file'
    )
    expect(prompt).toContain('Do not edit the PDF')
    expect(prompt).toContain('compile the PDF')
  })

  it('points the agent at the SyncTeX lines when the build recorded them', () => {
    const prompt = buildWritingPdfRevisionPrompt(source, selection, 'Tighten this.', {
      ranges: [{ sourcePath: 'paper/section.tex', startLine: 24, endLine: 27 }],
      stale: true
    })
    expect(prompt).toContain('SyncTeX maps the selected text to "paper/section.tex:24-27"')
    expect(prompt).toContain('the lines may have moved')
    expect(prompt).toContain('even if similar text appears elsewhere')
    expect(prompt).not.toContain('The main and currently open files are hints')
    expect(prompt).toContain('If the source is missing, duplicated, or ambiguous')
  })

  it('sends only through the explicitly bound structured session', async () => {
    const send = vi.fn().mockResolvedValue({ status: 'sent' })
    const result = await sendWritingPdfRevision({
      source,
      selection,
      instruction: 'Clarify this sentence.',
      binding: { sessionId: 'writing-session', tabId: 'writing-tab' },
      send
    })
    expect(result.status).toBe('sent')
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        worktreeId: 'worktree-1',
        target: { kind: 'structured-session', sessionId: 'writing-session' }
      })
    )
  })

  it('rejects an empty instruction or invalid page without sending', async () => {
    const send = vi.fn()
    const binding = { sessionId: 'writing-session', tabId: 'writing-tab' }
    expect(
      (await sendWritingPdfRevision({ source, selection, instruction: ' ', binding, send })).status
    ).toBe('invalid')
    expect(
      (
        await sendWritingPdfRevision({
          source,
          selection: { ...selection, pageNumber: 0 },
          instruction: 'Edit',
          binding,
          send
        })
      ).status
    ).toBe('invalid')
    expect(send).not.toHaveBeenCalled()
  })
})
