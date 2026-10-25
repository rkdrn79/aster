// @vitest-environment happy-dom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { i18n } from '../../i18n/i18n'

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  openTaskPage: vi.fn(),
  openAutomationsPage: vi.fn(),
  openSkillsPage: vi.fn(),
  openMobilePage: vi.fn(),
  openArtifactsPage: vi.fn(),
  openModal: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) => selector(mocks.state),
    { getState: () => mocks.state }
  )
}))

vi.mock('@/hooks/useShortcutLabel', () => ({
  useShortcutKeyComboDetails: () => [{ keys: ['⌘', 'J'], doubleTap: false }]
}))

// The opt-in Artifacts page exists only in builds that name a share service.
vi.mock('@/lib/cloud-sharing-availability', () => ({
  ARTIFACT_SHARING_AVAILABLE: true,
  SKILL_SHARING_AVAILABLE: true
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div data-testid="more-menu">{children}</div>
  ),
  DropdownMenuItem: ({ children, onSelect }: { children: ReactNode; onSelect?: () => void }) => (
    <button type="button" data-testid="more-item" onClick={onSelect}>
      {children}
    </button>
  )
}))

import SidebarNav, { shouldShowArtifactsButton, shouldShowMobileButton } from './SidebarNav'

function setSidebarState(settings: GlobalSettings = getDefaultSettings('/tmp')): void {
  mocks.state = {
    settings,
    activeView: 'terminal',
    openTaskPage: mocks.openTaskPage,
    openAutomationsPage: mocks.openAutomationsPage,
    openSkillsPage: mocks.openSkillsPage,
    openMobilePage: mocks.openMobilePage,
    openArtifactsPage: mocks.openArtifactsPage,
    openModal: mocks.openModal
  }
}

const mountedRoots: Root[] = []

async function renderSidebarNav(): Promise<HTMLDivElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoots.push(root)
  await act(async () => {
    root.render(<SidebarNav />)
  })
  return container
}

function moreItemLabels(container: ParentNode): string[] {
  return Array.from(container.querySelectorAll('[data-testid="more-item"]')).map(
    (item) => item.textContent?.trim() ?? ''
  )
}

describe('SidebarNav', () => {
  afterEach(async () => {
    await act(async () => {
      for (const root of mountedRoots.splice(0)) {
        root.unmount()
      }
    })
    document.body.innerHTML = ''
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    await i18n.changeLanguage('en')
    setSidebarState()
  })

  it('keeps older settings defaults for the sidebar destinations', () => {
    expect(shouldShowMobileButton(null)).toBe(true)
    expect(shouldShowArtifactsButton(null)).toBe(false)
    expect(shouldShowArtifactsButton({ showArtifactsButton: true })).toBe(true)
  })

  it('collects rarely used pages under More, honoring the sidebar visibility settings', async () => {
    setSidebarState({
      ...getDefaultSettings('/tmp'),
      showAutomationsButton: false,
      showArtifactsButton: true
    })
    const container = await renderSidebarNav()

    expect(moreItemLabels(container)).toEqual(['Tasks', 'Artifacts'])
    expect(container.textContent).not.toContain('New')
  })

  it('opens the chosen page from the More menu', async () => {
    const container = await renderSidebarNav()
    const tasks = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[data-testid="more-item"]')
    ).find((item) => item.textContent?.includes('Tasks'))

    await act(async () => tasks?.click())

    expect(mocks.openTaskPage).toHaveBeenCalledOnce()
  })

  it('names the current page on the More trigger while one of its pages is open', async () => {
    mocks.state = { ...mocks.state, activeView: 'automations' }
    const container = await renderSidebarNav()
    const trigger = container.querySelector('[aria-current="page"]')

    expect(trigger?.textContent).toContain('Automations')
  })
})
