// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { UpdateCardStateContent } from './UpdateCardStateContent'

afterEach(cleanup)

it('offers the Aster update action without linking to upstream release notes', () => {
  const onUpdate = vi.fn()
  render(
    <UpdateCardStateContent
      status={{ state: 'available', version: '0.1.0-preview.2', changelog: null }}
      changelog={null}
      errorCard={null}
      linuxPackageRecovery={null}
      isLocalBuild={false}
      hasStartedDownload={false}
      prefersReducedMotion={false}
      mediaFailed={false}
      mediaLoaded={false}
      onMediaError={() => undefined}
      onMediaLoad={() => undefined}
      onUpdate={onUpdate}
      onInstallRetry={() => undefined}
      onDismiss={() => undefined}
      onCollapse={() => undefined}
    />
  )

  expect(screen.getByText('Aster v0.1.0-preview.2 is ready.')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Release notes' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Update' }))
  expect(onUpdate).toHaveBeenCalledOnce()
})

it('shows Aster download progress and restart action for a future update', () => {
  const props = {
    changelog: null,
    errorCard: null,
    linuxPackageRecovery: null,
    isLocalBuild: false,
    hasStartedDownload: false,
    prefersReducedMotion: false,
    mediaFailed: false,
    mediaLoaded: false,
    onMediaError: () => undefined,
    onMediaLoad: () => undefined,
    onUpdate: () => undefined,
    onInstallRetry: vi.fn(),
    onDismiss: () => undefined,
    onCollapse: () => undefined
  }
  const { rerender } = render(
    <UpdateCardStateContent
      {...props}
      status={{ state: 'downloading', version: '0.1.0-preview.2', percent: 42 }}
    />
  )

  expect(screen.getByText('Aster v0.1.0-preview.2 is downloading.')).toBeTruthy()
  expect(screen.getByText('Downloading... 42%')).toBeTruthy()

  rerender(
    <UpdateCardStateContent
      {...props}
      status={{ state: 'downloaded', version: '0.1.0-preview.2' }}
    />
  )
  expect(
    screen.getByText("Aster v0.1.0-preview.2 is downloaded. Restart when you're ready.")
  ).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Restart to Update' }))
  expect(props.onInstallRetry).toHaveBeenCalledOnce()
})
