// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const viewport = vi.hoisted(() => ({ compact: false, docked: true }))

vi.mock('@/app-shell/use-compact-viewport', () => ({
  useCompactViewport: () => viewport.compact,
  useLeftSidebarDocked: () => viewport.docked
}))

import { ResearchPageHeader } from './ResearchPageLayout'

function clearance(side: 'left' | 'right'): HTMLElement | null {
  return document.querySelector(`[data-research-page-header-clearance="${side}"]`)
}

beforeEach(() => {
  viewport.compact = false
  viewport.docked = true
})

afterEach(cleanup)

// The header drags the window; Electron lets only a no-drag descendant carve a drag region, so the
// floating controls over its padding need one beneath them.
it('keeps the right-sidebar toggle and window controls clickable over the header', () => {
  render(<ResearchPageHeader title="Figures" />)
  expect(clearance('left')).toBeNull()
  expect(clearance('right')?.className).toContain('[-webkit-app-region:no-drag]')
})

it('keeps the floating sidebar controls clickable once the sidebar collapses', () => {
  viewport.docked = false
  render(<ResearchPageHeader title="Figures" />)
  const left = clearance('left')
  expect(left?.className).toContain('[-webkit-app-region:no-drag]')
  expect(left?.style.width).toBe('calc(var(--collapsed-sidebar-header-width) + 1rem)')
})

it('drops the right clearance on a phone, where nothing floats over that edge', () => {
  viewport.compact = true
  viewport.docked = false
  render(<ResearchPageHeader title="Figures" />)
  expect(clearance('right')).toBeNull()
  expect(clearance('left')).not.toBeNull()
})
