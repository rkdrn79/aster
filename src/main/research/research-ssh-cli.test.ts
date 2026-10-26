import { beforeEach, describe, expect, it, vi } from 'vitest'

const { runResearchComputeCommand } = vi.hoisted(() => ({ runResearchComputeCommand: vi.fn() }))
vi.mock('./research-compute-transport', () => ({ runResearchComputeCommand }))

import { findResearchSshCli, runResearchSshCli } from './research-ssh-cli'

describe('SSH project CLI', () => {
  beforeEach(() => runResearchComputeCommand.mockReset())

  it('selects the paired profile and keeps Slack tokens in stdin', async () => {
    runResearchComputeCommand
      .mockResolvedValueOnce({
        status: 'ok',
        stdout: `__ASTER_SSH_CLI_BEGIN__/home/alex/.orca/cli/bin/aster\n${JSON.stringify({ ok: true, result: { runtime: { runtimeId: 'other' } } })}\n__ASTER_SSH_CLI_END__\n__ASTER_SSH_CLI_BEGIN__/home/alex/.orca-12345678/cli/bin/aster\n${JSON.stringify({ ok: true, result: { runtime: { runtimeId: 'paired' } } })}\n__ASTER_SSH_CLI_END__\n`
      })
      .mockResolvedValueOnce({
        status: 'ok',
        stdout: JSON.stringify({ ok: true, result: { configured: true } })
      })
    const secret = JSON.stringify({ appToken: 'xapp-secret', botToken: 'xoxb-secret' })
    expect(
      await runResearchSshCli({
        targetId: 'ssh-test',
        runtimeId: 'paired',
        args: ['slack', 'project', 'setup'],
        stdin: secret
      })
    ).toEqual({ configured: true })
    expect(runResearchComputeCommand).toHaveBeenCalledTimes(2)
    const command = String(runResearchComputeCommand.mock.calls[1][2])
    expect(command).toContain('/home/alex/.orca-12345678/cli/bin/aster')
    expect(command).not.toContain('xapp-secret')
    expect(runResearchComputeCommand.mock.calls[1][4]).toBe(secret)
  })

  it('refuses a host that does not report the paired runtime identity', async () => {
    runResearchComputeCommand.mockResolvedValueOnce({
      status: 'ok',
      stdout: `__ASTER_SSH_CLI_BEGIN__/home/alex/.orca/cli/bin/aster\n${JSON.stringify({ ok: true, result: { runtime: { runtimeId: 'other' } } })}\n__ASTER_SSH_CLI_END__\n`
    })
    await expect(findResearchSshCli('ssh-other', 'expected')).rejects.toThrow('not ready')
  })
})
