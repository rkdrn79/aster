// @vitest-environment happy-dom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SidebarSettingsHelpMenu } from './SidebarSettingsHelpMenu'

const mocks = vi.hoisted(() => ({
  openModal: vi.fn(),
  openSettingsPage: vi.fn(),
  openSettingsTarget: vi.fn(),
  appRestart: vi.fn(),
  updaterCheck: vi.fn(),
  shellOpenUrl: vi.fn(),
  useShortcutKeyDetails: vi.fn(),
  /** Counts evaluations of the feedback chunk; a dynamic import evaluates it exactly once. */
  feedbackChunkLoads: 0,
  setupProgress: {
    ready: true,
    coreDoneCount: 2,
    coreTotal: 5,
    stepDone: {}
  }
}))

let updateStatus = { state: 'idle' } as const
const roots: Root[] = []

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      openModal: mocks.openModal,
      openSettingsPage: mocks.openSettingsPage,
      openSettingsTarget: mocks.openSettingsTarget,
      updateStatus
    })
}))

vi.mock('@/hooks/useShortcutLabel', () => ({
  useShortcutKeyDetails: mocks.useShortcutKeyDetails
}))

vi.mock('@/hooks/useMountedRef', () => ({
  useMountedRef: () => ({ current: true })
}))

vi.mock('../onboarding/show-onboarding-event', () => ({
  showOnboardingFromRenderer: vi.fn()
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({
    children,
    onOpenChange
  }: {
    children: ReactNode
    onOpenChange?: (open: boolean) => void
  }) => (
    <>
      <button data-testid="open-menu" onClick={() => onOpenChange?.(true)} />
      {children}
    </>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuItem: ({
    children,
    disabled,
    onPointerDown,
    onSelect,
    title
  }: {
    children: ReactNode
    disabled?: boolean
    onPointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void
    onSelect?: (event: Event) => void
    title?: string
  }) => (
    <button
      data-testid="menu-item"
      disabled={disabled}
      onClick={() => onSelect?.(new Event('menu.itemSelect'))}
      onPointerDown={onPointerDown}
      title={title}
    >
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    'aria-label': ariaLabel
  }: {
    children: ReactNode
    onClick?: (event: React.MouseEvent) => void
    'aria-label'?: string
  }) => (
    <button data-testid="trigger-button" aria-label={ariaLabel} onClick={onClick}>
      {children}
    </button>
  )
}))

vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('./SidebarFeedbackDialog', () => {
  mocks.feedbackChunkLoads += 1
  return { SidebarFeedbackDialog: () => <div data-testid="feedback-dialog" /> }
})

function installWindowApi(): void {
  Object.assign(window, {
    api: {
      app: {
        restart: mocks.appRestart
      },
      shell: {
        openUrl: mocks.shellOpenUrl
      },
      updater: {
        check: mocks.updaterCheck
      }
    }
  })
}

async function renderMenu(): Promise<HTMLDivElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)

  await act(async () => {
    root.render(<SidebarSettingsHelpMenu />)
  })

  return container
}

function findMenuItem(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(
    container.querySelectorAll<HTMLButtonElement>('[data-testid="menu-item"]')
  ).find((element) => element.textContent?.includes(label))
  expect(button).toBeDefined()
  return button as HTMLButtonElement
}

describe('SidebarSettingsHelpMenu', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.clearAllMocks()
    mocks.appRestart.mockResolvedValue(undefined)
    installWindowApi()
    mocks.useShortcutKeyDetails.mockReturnValue({ keys: ['⌘', ','], doubleTap: false })
    updateStatus = { state: 'idle' }
    mocks.setupProgress = {
      ready: true,
      coreDoneCount: 2,
      coreTotal: 5,
      stepDone: {}
    }
  })

  afterEach(() => {
    roots.splice(0).forEach((root) => {
      act(() => root.unmount())
    })
    document.body.replaceChildren()
  })

  it('renders the help button with correct aria-label', () => {
    const html = renderToStaticMarkup(<SidebarSettingsHelpMenu />)
    expect(html).toContain('Help')
  })

  it('renders the settings button with correct aria-label', () => {
    const html = renderToStaticMarkup(<SidebarSettingsHelpMenu />)
    expect(html).toContain('aria-label="Settings"')
  })

  it('renders the settings button before the help button', () => {
    const html = renderToStaticMarkup(<SidebarSettingsHelpMenu />)
    const settingsIndex = html.indexOf('lucide-settings')
    const helpIndex = html.indexOf('lucide-circle-question-mark')
    expect(settingsIndex).toBeGreaterThanOrEqual(0)
    expect(helpIndex).toBeGreaterThan(settingsIndex)
  })

  it('hides upstream feedback from Aster', () => {
    const html = renderToStaticMarkup(<SidebarSettingsHelpMenu />)
    expect(html).not.toContain('Send Feedback')
  })

  it('renders Keyboard Shortcuts menu item', () => {
    const html = renderToStaticMarkup(<SidebarSettingsHelpMenu />)
    expect(html).toContain('Keyboard Shortcuts')
  })

  it('renders the Onboarding menu item by default', () => {
    const html = renderToStaticMarkup(<SidebarSettingsHelpMenu />)
    expect(html).toContain('Onboarding')
  })

  it('renders Restart Aster by default', () => {
    const html = renderToStaticMarkup(<SidebarSettingsHelpMenu />)
    expect(html).toContain('Restart Aster')
  })

  it('restarts Aster from the help menu', async () => {
    const container = await renderMenu()
    const restartButton = findMenuItem(container, 'Restart Aster')
    await act(async () => restartButton.click())
    expect(mocks.appRestart).toHaveBeenCalledOnce()
  })

  it('does not show upstream links or an upstream update channel', () => {
    const html = renderToStaticMarkup(<SidebarSettingsHelpMenu />)
    for (const label of [
      'Changelog',
      'Discord',
      'Check for Updates',
      'Send Feedback',
      'Milestones'
    ]) {
      expect(html).not.toContain(label)
    }
    expect(mocks.shellOpenUrl).not.toHaveBeenCalled()
  })

  it('renders shortcut keys in the settings tooltip', () => {
    const html = renderToStaticMarkup(<SidebarSettingsHelpMenu />)
    expect(html).toContain('⌘')
    expect(html).toContain('>,</span>')
  })
})
