import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSlackBotIdentity, postSlackMessage, slackApi } from './slack-api'

afterEach(() => vi.unstubAllGlobals())

describe('Slack Web API requests', () => {
  it('uses a bearer header and a threaded reply without link unfurls', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, ts: '123.456' })
    }))
    vi.stubGlobal('fetch', fetchMock)
    await postSlackMessage({
      token: 'fixture-bot-token',
      channel: 'D123',
      threadTs: '123.001',
      text: 'Answer'
    })
    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://slack.com/api/chat.postMessage')
    expect(options.headers).toMatchObject({ Authorization: 'Bearer fixture-bot-token' })
    expect(JSON.parse(options.body as string)).toMatchObject({
      channel: 'D123',
      thread_ts: '123.001',
      text: 'Answer',
      parse: 'none',
      unfurl_links: false
    })
    expect(options.body).not.toContain('fixture-bot-token')
  })

  it('opens Socket Mode with the app token only in the header', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, url: 'wss://example.slack.com/socket' })
    }))
    vi.stubGlobal('fetch', fetchMock)
    await slackApi('apps.connections.open', 'fixture-app-token')
    const [, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(options.headers).toMatchObject({ Authorization: 'Bearer fixture-app-token' })
    expect(options.body).not.toContain('fixture-app-token')
  })

  it('gets the bot and workspace identity without putting the token in the request body', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, user_id: 'UASTER', team_id: 'T123' })
    }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await getSlackBotIdentity('fixture-bot-token')).toEqual({
      userId: 'UASTER',
      teamId: 'T123'
    })
    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://slack.com/api/auth.test')
    expect(options.body).not.toContain('fixture-bot-token')
  })
})
