// @vitest-environment happy-dom

import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CliSkillSetupTerminal } from './CliSkillSetupTerminal'
import { ORCA_CLI_ORCHESTRATION_SKILL_INSTALL_COMMAND } from '@/lib/agent-feature-install-commands'

const mocks = vi.hoisted(() => ({
  runtime: {
    agentRuntime: { runtime: 'wsl' as const, wslDistro: 'Missing', label: 'WSL Missing' },
    installDisabledReason: 'The selected WSL distro is unavailable.',
    terminalShellOverride: 'powershell.exe'
  },
  terminalCommand: ''
}))

vi.mock('@/hooks/useActiveProjectSkillRuntime', () => ({
  useActiveProjectSkillRuntime: () => mocks.runtime
}))

vi.mock('@/components/onboarding/OnboardingInlineCommandTerminal', () => ({
  OnboardingInlineCommandTerminal: ({
    command,
    prepareCommandForShell,
    shellOverride
  }: {
    command: string
    prepareCommandForShell?: (command: string, shellOverride?: string) => string
    shellOverride?: string
  }) => {
    mocks.terminalCommand = prepareCommandForShell?.(command, shellOverride) ?? command
    return null
  }
}))

describe('CliSkillSetupTerminal', () => {
  beforeEach(() => {
    mocks.terminalCommand = ''
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        platform: { get: () => ({ platform: 'win32' }) }
      }
    })
  })

  afterEach(() => {
    cleanup()
    Reflect.deleteProperty(window, 'api')
  })

  it('runs the Windows host fallback when the selected WSL runtime needs repair', () => {
    render(
      <TooltipProvider>
        <CliSkillSetupTerminal />
      </TooltipProvider>
    )

    // The host fallback runs the app CLI's bundled install as-is, not through the WSL wrapper.
    expect(mocks.terminalCommand).toBe(ORCA_CLI_ORCHESTRATION_SKILL_INSTALL_COMMAND)
    expect(mocks.terminalCommand).not.toContain('wsl.exe')
  })
})
