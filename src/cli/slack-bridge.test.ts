import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RawData } from 'ws'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RuntimeClient } from './runtime-client'
import { runSlackBridge } from './slack-bridge'
import type { SlackApiCall, SlackSocket } from './slack-api'
import type { SlackCoordinator } from './slack-agent-delivery'
import type { SlackBridgeRoute } from './slack-events'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function fakeSocket(): { socket: SlackSocket; emit: (value: unknown) => void; sent: string[] } {
  const messages: ((data: RawData) => void)[] = []
  const sent: string[] = []
  return {
    socket: {
      on: (_event, listener) => {
        messages.push(listener)
      },
      once: () => undefined,
      send: (data) => {
        sent.push(data)
      },
      close: () => undefined
    },
    emit: (value) => messages.forEach((listener) => listener(Buffer.from(JSON.stringify(value)))),
    sent
  }
}

describe('Slack Socket Mode bridge', () => {
  it('acks a mention and returns one coordinator answer to the same thread', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'aster-slack-bridge-'))
    roots.push(userDataPath)
    const client = new RuntimeClient(userDataPath, 1_000, null, null, '/tmp/aster')
    const wire = fakeSocket()
    const posts: Record<string, unknown>[] = []
    const api: SlackApiCall = async (method, _token, body) => {
      if (method === 'auth.test') {
        return { ok: true, user_id: 'UASTER', team_id: 'TTEAM' }
      }
      if (method === 'chat.postMessage') {
        posts.push(body ?? {})
        return { ok: true }
      }
      throw new Error(`Unexpected Slack API call: ${method}`)
    }
    const route: SlackBridgeRoute = {
      id: 'project-a',
      projectName: 'Project A',
      worktree: 'path:/work/project-a',
      agent: 'codex',
      allowedUsers: new Set(['U123']),
      allowedChannels: new Set(['C123'])
    }
    const deliver = vi.fn<SlackCoordinator['deliver']>(async () => ({
      sessionId: 'session-1',
      previousTurnId: null,
      messageId: 'message-1'
    }))
    const controller = new AbortController()
    const statuses: string[] = []
    const bridge = runSlackBridge({
      client,
      routes: () => [route],
      appToken: 'xapp-test',
      botToken: 'xoxb-test',
      signal: controller.signal,
      mode: 'service',
      slack: { api, openSocket: async () => wire.socket },
      coordinator: { deliver, waitForAnswer: async () => 'Verified result: 0.8' },
      onStatus: (status) => {
        statuses.push(status)
      }
    })
    try {
      await vi.waitFor(() => expect(statuses).toContain('connected'))
      const event = {
        envelope_id: 'envelope-1',
        type: 'events_api',
        payload: {
          type: 'event_callback',
          event_id: 'event-1',
          team_id: 'TTEAM',
          event: {
            type: 'app_mention',
            user: 'U123',
            channel: 'C123',
            ts: '1720000000.000001',
            text: '<@UASTER> compare two runs'
          }
        }
      }
      wire.emit(event)
      await vi.waitFor(() => expect(posts).toHaveLength(2))
      wire.emit(event)
      await vi.waitFor(() => expect(deliver).toHaveBeenCalledTimes(1))
      expect(wire.sent).toContain(JSON.stringify({ envelope_id: 'envelope-1' }))
      expect(deliver).toHaveBeenCalledWith(
        expect.objectContaining({
          projectName: 'Project A',
          worktree: 'path:/work/project-a',
          agent: 'codex'
        })
      )
      expect(posts[1]).toMatchObject({
        channel: 'C123',
        thread_ts: '1720000000.000001',
        text: 'Verified result: 0.8'
      })
    } finally {
      controller.abort()
      await bridge
    }
  })

  it('keeps one socket while routing identical workspace paths to their selected runtime', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'aster-slack-routing-'))
    roots.push(userDataPath)
    const local = new RuntimeClient(userDataPath, 1_000, null, null, '/tmp/aster')
    const remote = new RuntimeClient(userDataPath, 1_000, null, null, '/tmp/aster')
    const wire = fakeSocket()
    const routes: SlackBridgeRoute[] = [
      {
        id: 'local',
        projectName: 'Local',
        worktree: 'id:local-repo::/project',
        agent: 'codex',
        allowedUsers: new Set(['U123']),
        allowedChannels: new Set(['C123'])
      },
      {
        id: 'research',
        projectName: 'Research host',
        worktree: 'id:research-repo::/project',
        environmentId: 'research',
        agent: 'codex',
        allowedUsers: new Set(['U123']),
        allowedChannels: new Set(['C456'])
      }
    ]
    const api: SlackApiCall = async (method) =>
      method === 'auth.test' ? { ok: true, user_id: 'UASTER', team_id: 'TTEAM' } : { ok: true }
    const deliver = vi.fn<SlackCoordinator['deliver']>(async () => ({
      sessionId: 's',
      previousTurnId: null,
      messageId: 'm'
    }))
    const waitForAnswer = vi.fn<SlackCoordinator['waitForAnswer']>(async () => 'done')
    const controller = new AbortController()
    const statuses: string[] = []
    const openSocket = vi.fn(async () => wire.socket)
    const bridge = runSlackBridge({
      client: local,
      clientForRoute: (route) => (route.id === 'research' ? remote : local),
      routes: () => routes,
      appToken: 'xapp-test',
      botToken: 'xoxb-test',
      signal: controller.signal,
      slack: { api, openSocket },
      coordinator: { deliver, waitForAnswer },
      onStatus: (status) => statuses.push(status)
    })
    const mention = (channel: string, ts: string) => ({
      envelope_id: `envelope-${ts}`,
      type: 'events_api',
      payload: {
        type: 'event_callback',
        event_id: `event-${ts}`,
        team_id: 'TTEAM',
        event: { type: 'app_mention', user: 'U123', channel, ts, text: '<@UASTER> check' }
      }
    })
    try {
      await vi.waitFor(() => expect(statuses).toContain('connected'))
      wire.emit(mention('C456', '1720000000.000001'))
      await vi.waitFor(() => expect(deliver).toHaveBeenCalledTimes(1))
      expect(deliver).toHaveBeenCalledWith(
        expect.objectContaining({ client: remote, worktree: 'id:research-repo::/project' })
      )
      await vi.waitFor(() => expect(waitForAnswer).toHaveBeenCalledWith(remote, expect.anything()))
      wire.emit(mention('C123', '1720000000.000002'))
      await vi.waitFor(() => expect(deliver).toHaveBeenCalledTimes(2))
      expect(deliver).toHaveBeenLastCalledWith(
        expect.objectContaining({ client: local, worktree: 'id:local-repo::/project' })
      )
      expect(openSocket).toHaveBeenCalledTimes(1)
    } finally {
      controller.abort()
      await bridge
    }
  })

  it('reports a disconnected remote host without falling back to the local runtime', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'aster-slack-disconnected-'))
    roots.push(userDataPath)
    const client = new RuntimeClient(userDataPath, 1_000, null, null, '/tmp/aster')
    const wire = fakeSocket()
    const posted: string[] = []
    const api: SlackApiCall = async (method, _token, body) => {
      if (method === 'auth.test') {
        return { ok: true, user_id: 'UASTER', team_id: 'TTEAM' }
      }
      if (method === 'chat.postMessage') {
        posted.push(String(body?.text ?? ''))
      }
      return { ok: true }
    }
    const deliver = vi.fn<SlackCoordinator['deliver']>()
    const controller = new AbortController()
    const statuses: string[] = []
    const bridge = runSlackBridge({
      client,
      clientForRoute: () => {
        throw new Error('Research host disconnected')
      },
      routes: () => [
        {
          id: 'research',
          projectName: 'Research host',
          worktree: 'id:repo::/project',
          environmentId: 'research',
          agent: 'codex',
          allowedUsers: new Set(['U123']),
          allowedChannels: new Set(['C456'])
        }
      ],
      appToken: 'xapp-test',
      botToken: 'xoxb-test',
      signal: controller.signal,
      slack: { api, openSocket: async () => wire.socket },
      coordinator: { deliver, waitForAnswer: async () => 'unused' },
      onStatus: (status) => statuses.push(status)
    })
    try {
      await vi.waitFor(() => expect(statuses).toContain('connected'))
      wire.emit({
        envelope_id: 'env',
        type: 'events_api',
        payload: {
          type: 'event_callback',
          event_id: 'event-1',
          team_id: 'TTEAM',
          event: {
            type: 'app_mention',
            user: 'U123',
            channel: 'C456',
            ts: '1720000000.000001',
            text: '<@UASTER> check'
          }
        }
      })
      await vi.waitFor(() => expect(posted).toHaveLength(1))
      expect(posted[0]).toContain('could not complete')
      expect(deliver).not.toHaveBeenCalled()
      expect(wire.sent).toContain(JSON.stringify({ envelope_id: 'env' }))
    } finally {
      controller.abort()
      await bridge
    }
  })
})
