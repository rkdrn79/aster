// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ResearchWritingPanelToggles } from './ResearchWritingPanelToggles'

afterEach(cleanup)

it('offers independent pane toggles and protects the last visible pane', () => {
  const onToggle = vi.fn()
  const view = render(
    <ResearchWritingPanelToggles wide visiblePanes={[true, true, true]} onToggle={onToggle} />
  )
  const agent = screen.getByRole('button', { name: 'Agent' })
  expect(agent.getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(agent)
  expect(onToggle).toHaveBeenCalledWith(0)

  view.rerender(
    <ResearchWritingPanelToggles wide visiblePanes={[false, false, true]} onToggle={onToggle} />
  )
  expect(screen.getByRole('button', { name: 'PDF' }).hasAttribute('disabled')).toBe(true)
  expect(screen.getByRole('button', { name: 'Agent' }).getAttribute('aria-pressed')).toBe('false')
})

it('swaps pane order by keyboard or drag while preserving the visibility controls', () => {
  const onToggle = vi.fn()
  const onReorder = vi.fn()
  const view = render(
    <ResearchWritingPanelToggles
      wide
      visiblePanes={[true, true, true]}
      order={[2, 0, 1]}
      onToggle={onToggle}
      onReorder={onReorder}
    />
  )
  const labels = () =>
    [...view.container.querySelectorAll('[aria-label="Writing panels"] button')].map((button) =>
      button.textContent?.trim()
    )
  expect(labels()).toEqual(['PDF', 'Agent', 'TeX'])
  fireEvent.keyDown(screen.getByRole('button', { name: 'Agent' }), {
    key: 'ArrowLeft',
    altKey: true
  })
  expect(onReorder).toHaveBeenCalledWith(0, 2)

  const dataTransfer = { effectAllowed: '', setData: vi.fn() }
  fireEvent.dragStart(screen.getByRole('button', { name: 'PDF' }), { dataTransfer })
  fireEvent.dragOver(screen.getByRole('button', { name: 'TeX' }), { dataTransfer })
  fireEvent.drop(screen.getByRole('button', { name: 'TeX' }), { dataTransfer })
  expect(onReorder).toHaveBeenCalledWith(2, 1)
  expect(onToggle).not.toHaveBeenCalled()
})
