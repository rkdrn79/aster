import { describe, expect, it } from 'vitest'
import {
  getTuiAgentDetectionProbeCommands,
  KNOWN_TUI_AGENT_DETECTION_COMMANDS,
  resolveDetectedTuiAgentIds
} from '../../shared/tui-agent-detection-commands'
import { CLI_NAME, DEV_CLI_NAME, LINUX_CLI_NAME } from '../../shared/product-brand'

describe('tui agent detection commands', () => {
  it.each(['darwin', 'linux', 'win32', 'wsl'] as const)(
    'detects modern and legacy Qoder once on %s',
    (runtime) => {
      const commands = KNOWN_TUI_AGENT_DETECTION_COMMANDS.filter(
        (command) => command.id === 'qoder'
      )
      for (const found of [
        new Set(['qoder']),
        new Set(['qodercli']),
        new Set(['qoder', 'qodercli'])
      ]) {
        expect(resolveDetectedTuiAgentIds(commands, found, runtime)).toEqual(['qoder'])
      }
      expect(resolveDetectedTuiAgentIds(commands, new Set(['qoder-unrelated']), runtime)).toEqual(
        []
      )
    }
  )
  it('requires Claude before reporting Claude Agent Teams', () => {
    const commands = KNOWN_TUI_AGENT_DETECTION_COMMANDS.filter(
      (command) => command.id === 'claude-agent-teams'
    )

    const cliCommands = [...new Set([CLI_NAME, DEV_CLI_NAME, LINUX_CLI_NAME])]
    expect(commands).toEqual(
      cliCommands.map((cmd) => ({
        id: 'claude-agent-teams',
        cmd,
        requiredCommands: ['claude'],
        unsupportedRuntimes: ['win32', 'wsl']
      }))
    )
    expect(getTuiAgentDetectionProbeCommands(commands, 'linux')).toEqual([
      CLI_NAME,
      'claude',
      ...cliCommands.slice(1)
    ])
    expect(resolveDetectedTuiAgentIds(commands, new Set([CLI_NAME]), 'linux')).toEqual([])
    expect(resolveDetectedTuiAgentIds(commands, new Set([CLI_NAME, 'claude']), 'linux')).toEqual([
      'claude-agent-teams'
    ])
    expect(getTuiAgentDetectionProbeCommands(commands, 'win32')).toEqual([])
    expect(resolveDetectedTuiAgentIds(commands, new Set([CLI_NAME, 'claude']), 'win32')).toEqual([])
    expect(getTuiAgentDetectionProbeCommands(commands, 'wsl')).toEqual([])
    expect(
      resolveDetectedTuiAgentIds(commands, new Set([LINUX_CLI_NAME, 'claude']), 'wsl')
    ).toEqual([])
  })
})
