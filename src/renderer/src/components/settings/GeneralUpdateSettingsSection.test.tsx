// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '../../store'
import { GeneralUpdateSettingsSection } from './GeneralUpdateSettingsSection'

vi.mock('./GeneralRemoteServerUpdates', () => ({ GeneralRemoteServerUpdates: () => null }))
vi.mock('./ReleaseChannelSection', () => ({ ReleaseChannelSection: () => null }))

const quitAndInstall = vi.fn()

beforeEach(() => {
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
  })
  quitAndInstall.mockReset().mockResolvedValue(undefined)
  useAppStore.setState({
    updateStatus: { state: 'available', version: '1.4.200', changelog: null }
  })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      updater: {
        check: vi.fn(),
        download: vi.fn(),
        quitAndInstall,
        getVersion: vi.fn().mockResolvedValue('1.4.199')
      }
    }
  })
})

afterEach(() => {
  cleanup()
  useAppStore.setState({ updateStatus: { state: 'idle' } })
})

it('offers GitHub release checks without promising automatic installation', () => {
  useAppStore.setState({ updateStatus: { state: 'idle' } })
  render(<GeneralUpdateSettingsSection />)

  expect(screen.getByRole('button', { name: 'Check for Updates' }).hasAttribute('disabled')).toBe(
    false
  )
  expect(screen.getByText(/Aster checks GitHub Releases on launch/)).toBeTruthy()
  expect(screen.queryByText('Updates are checked automatically on launch.')).toBeNull()
})

it('offers the manual DMG when a GitHub release is available', () => {
  useAppStore.setState({
    updateStatus: {
      state: 'available',
      version: '0.1.1',
      changelog: null,
      manualDownloadUrl:
        'https://github.com/rkdrn79/aster/releases/download/v0.1.1/Aster-mac-arm64.dmg'
    }
  })
  render(<GeneralUpdateSettingsSection />)

  expect(screen.getByRole('button', { name: 'Download DMG (0.1.1)' })).toBeTruthy()
  expect(screen.getByText(/replace the app in Applications/)).toBeTruthy()
})

it('describes the available action as a download', () => {
  render(<GeneralUpdateSettingsSection />)

  expect(screen.getByRole('button', { name: 'Download Update (1.4.200)' })).toBeTruthy()
  expect(screen.getByText(/is available\. Click "Download Update" to download it\./)).toBeTruthy()
  expect(screen.queryByText(/download and install it/)).toBeNull()
})

it('retries installation from the settings panel when a staged update is blocked', () => {
  useAppStore.setState({
    updateStatus: {
      state: 'error',
      version: '1.4.200',
      message: 'Close the other Orca instances before installing this update.',
      retryAction: 'install'
    }
  })
  render(<GeneralUpdateSettingsSection />)

  fireEvent.click(screen.getByRole('button', { name: 'Try Again' }))
  expect(quitAndInstall).toHaveBeenCalledTimes(1)
})

it.each([undefined, false] as const)(
  'does not offer install retry without an install action or when retry is refused (%s)',
  (retryable) => {
    useAppStore.setState({
      updateStatus: {
        state: 'error',
        version: '1.4.200',
        message: 'Update failed.',
        ...(retryable === false ? { retryAction: 'install', retryable } : {})
      }
    })
    render(<GeneralUpdateSettingsSection />)

    expect(screen.queryByRole('button', { name: 'Try Again' })).toBeNull()
    expect(quitAndInstall).not.toHaveBeenCalled()
  }
)

it('gives actionable server guidance while keeping the install retry', () => {
  useAppStore.setState({
    updateStatus: {
      state: 'error',
      version: '1.4.200',
      retryAction: 'install',
      message: 'Raw process listing',
      installBlock: { reason: 'running-instances', instances: [{ pid: 42, kind: 'server' }] }
    }
  })
  render(<GeneralUpdateSettingsSection />)
  expect(screen.getByText(/Stop the server from the terminal/)).toBeTruthy()
  expect(screen.queryByText(/Raw process listing/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Try Again' }))
  expect(quitAndInstall).toHaveBeenCalledOnce()
})

it('disables the restart button during preparation', () => {
  useAppStore.setState({
    updateStatus: { state: 'downloaded', version: '1.4.200', installing: true }
  })
  render(<GeneralUpdateSettingsSection />)
  const button = screen.getByRole('button', { name: 'Restart to Update (1.4.200)' })
  expect(button.hasAttribute('disabled')).toBe(true)
})
