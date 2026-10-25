// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ResearchLogPanel } from './ResearchLogPanel'
import { classifyLogLines } from './research-log-lines'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('marks a traceback from header to exception and harness lines as metrics', () => {
  const kinds = classifyLogLines(
    [
      'step 50 train_loss=0.05',
      'ASTER_METRIC {"step":50,"metrics":{"loss":0.05}}',
      'Traceback (most recent call last):',
      '  File "train.py", line 3, in <module>',
      'RuntimeError: CUDA out of memory',
      'cleanup done',
      'val_loss=nan'
    ].join('\n')
  ).map((line) => line.kind)
  expect(kinds).toEqual(['plain', 'metric', 'error', 'error', 'error', 'plain', 'error'])
})

it('hides harness lines until asked, searches the tail, and copies the unfiltered source', async () => {
  const source = 'START\nASTER_METRIC {"step":1}\nCUDA out of memory\nTAIL_MARKER\n'
  const writeClipboardText = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('Clipboard unavailable'))
  vi.stubGlobal('api', { ui: { writeClipboardText } })
  const { container } = render(
    <ResearchLogPanel
      path="/workspace/train.log"
      log={{ text: source, truncated: true, sourceSize: 11 * 1024 * 1024 }}
      error={null}
      failed
    />
  )
  const shown = (): string | null | undefined => container.querySelector('pre')?.textContent
  expect(shown()).toBe('STARTCUDA out of memoryTAIL_MARKER')
  expect(screen.getByText(/1 ASTER_METRIC\/ASTER_MEDIA line hidden/)).toBeTruthy()
  expect(screen.getByText('1 error line highlighted')).toBeTruthy()
  fireEvent.click(screen.getByRole('switch', { name: 'Show metric lines' }))
  expect(shown()).toContain('ASTER_METRIC')

  fireEvent.change(screen.getByRole('textbox', { name: 'Search loaded log tail' }), {
    target: { value: 'OUT OF MEMORY' }
  })
  expect(shown()).toBe('CUDA out of memory')
  expect(screen.getByText(/Showing 1 of 1 matching line/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Copy log' }))
  await waitFor(() => expect(writeClipboardText).toHaveBeenCalledWith(source))
  expect(screen.getByRole('status').textContent).toContain('Copied')

  fireEvent.click(screen.getByRole('button', { name: 'Copy log' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Could not copy'))
  expect(screen.queryByRole('status')).toBeNull()
})
