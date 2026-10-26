import { describe, expect, it, vi } from 'vitest'
import { SlackApiError, type SlackApiCall } from './slack-api'
import { collectMissedMentions } from './slack-catch-up'
import type { SlackBridgeRoute } from './slack-events'

const route: SlackBridgeRoute = {
  id: 'project-a',
  projectName: 'Project A',
  worktree: 'path:/work/project-a',
  agent: 'codex',
  allowedUsers: new Set(['U123']),
  allowedChannels: new Set(['C123'])
}
const base = {
  botToken: 'xoxb-test',
  identity: { userId: 'UASTER', teamId: 'TTEAM' },
  routes: [route],
  threads: {},
  isProcessed: () => false,
  now: 1_720_000_060_000
}

describe('Slack catch-up', () => {
  it('starts a new channel at now, without answering old history', async () => {
    const api = vi.fn<SlackApiCall>()
    const result = await collectMissedMentions({ ...base, api, cursors: {} })
    expect(result.found).toEqual([])
    expect(result.cursors.C123).toBe('1720000060.000000')
    expect(api).not.toHaveBeenCalled()
  })

  it('recovers only an authorized, unprocessed native mention', async () => {
    const api: SlackApiCall = async (method) => {
      if (method !== 'conversations.history') {
        throw new Error(`Unexpected ${method}`)
      }
      return {
        ok: true,
        messages: [
          { ts: '1720000001.000002', user: 'U123', text: '<@UASTER> summarize the run' },
          { ts: '1720000002.000002', user: 'U999', text: '<@UASTER> not allowed' },
          { ts: '1720000003.000002', user: 'U123', text: 'no mention' },
          { ts: '1720000004.000002', user: 'U123', text: '<@UASTER> already done' }
        ],
        has_more: false
      }
    }
    const result = await collectMissedMentions({
      ...base,
      api,
      cursors: { C123: '1720000000.000000' },
      isProcessed: (key) => key === 'C123:1720000004.000002'
    })
    expect(result.found).toHaveLength(1)
    expect(result.found[0].message).toMatchObject({
      text: 'summarize the run',
      late: true,
      eventTs: '1720000001.000002'
    })
    expect(result.cursors.C123).toBe('1720000004.000002')
  })

  it('keeps a cursor when history scope is missing and reports the exact limitation', async () => {
    const api: SlackApiCall = async () => {
      throw new SlackApiError('conversations.history', 'missing_scope', 'channels:history')
    }
    const result = await collectMissedMentions({
      ...base,
      api,
      cursors: { C123: '1720000000.000000' }
    })
    expect(result.cursors.C123).toBeUndefined()
    expect(result.notices).toEqual([expect.stringContaining('channels:history')])
  })
})
