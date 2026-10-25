import { describe, expect, it } from 'vitest'
import type { AgentSessionHistoryPage } from '../shared/agent-session-wire'
import { agentJournalSubmissionKey } from '../shared/agent-session-journal-item-key'
import { completedSlackReply, escapeSlackText, readSlackIncomingMessage } from './slack-events'

const allowed = new Set(['U123'])

function event(overrides: Record<string, unknown> = {}): unknown {
  return {
    type: 'events_api',
    payload: {
      type: 'event_callback',
      event_id: 'Ev123',
      team_id: 'T123',
      event: {
        type: 'message',
        channel_type: 'im',
        channel: 'D123',
        user: 'U123',
        ts: '1720000000.000001',
        text: 'Review this experiment',
        ...overrides
      }
    }
  }
}

describe('Slack DM admission', () => {
  it('accepts only an allowed human DM and preserves its thread', () => {
    expect(
      readSlackIncomingMessage(event({ thread_ts: '1719999999.000001' }), {
        allowedUsers: allowed
      })
    ).toMatchObject({
      eventId: 'Ev123',
      user: 'U123',
      channel: 'D123',
      threadTs: '1719999999.000001'
    })
    expect(readSlackIncomingMessage(event({ user: 'U999' }), { allowedUsers: allowed })).toBeNull()
    expect(
      readSlackIncomingMessage(event({ channel_type: 'channel' }), { allowedUsers: allowed })
    ).toBeNull()
    expect(
      readSlackIncomingMessage(event({ bot_id: 'B123' }), { allowedUsers: allowed })
    ).toBeNull()
    expect(
      readSlackIncomingMessage(event({ subtype: 'message_changed' }), { allowedUsers: allowed })
    ).toBeNull()
  })
})

describe('Slack channel mention admission', () => {
  const access = {
    allowedUsers: new Set(['*']),
    allowedChannels: new Set(['C123']),
    botUserId: 'UASTER',
    botTeamId: 'T123'
  }
  const mention = (overrides: Record<string, unknown> = {}): unknown =>
    event({
      type: 'app_mention',
      channel_type: 'channel',
      channel: 'C123',
      text: '<@UASTER> Check the latest run',
      ...overrides
    })

  it('accepts an authorized channel mention by another user and removes only this bot mention', () => {
    expect(
      readSlackIncomingMessage(
        mention({
          user: 'U999',
          text: '<@UOTHER> please ask <@UASTER> to compare runs',
          thread_ts: '1719999999.000001'
        }),
        access
      )
    ).toMatchObject({
      user: 'U999',
      channel: 'C123',
      threadTs: '1719999999.000001',
      text: '<@UOTHER> please ask to compare runs'
    })
  })

  it('rejects another channel, workspace, bot, empty prompt, and a plain text imitation', () => {
    expect(readSlackIncomingMessage(mention({ channel: 'C999' }), access)).toBeNull()
    expect(readSlackIncomingMessage(mention({ bot_id: 'B123' }), access)).toBeNull()
    expect(readSlackIncomingMessage(mention({ text: '<@UASTER>' }), access)).toBeNull()
    expect(
      readSlackIncomingMessage(mention({ text: '@Aster-alice please help' }), access)
    ).toBeNull()
    const otherTeam = mention() as { payload: { team_id: string } }
    otherTeam.payload.team_id = 'T999'
    expect(readSlackIncomingMessage(otherTeam, access)).toBeNull()
    expect(readSlackIncomingMessage(event(), access)).toBeNull()
  })

  it('limits callers unless the operator explicitly allows all channel members', () => {
    expect(
      readSlackIncomingMessage(mention({ user: 'U999' }), {
        ...access,
        allowedUsers: new Set(['U123'])
      })
    ).toBeNull()
  })
})

it('quotes agent text that could ping a Slack group', () => {
  expect(escapeSlackText('hi <!here> & <@U123>')).toBe('hi &lt;!here&gt; &amp; &lt;@U123&gt;')
})

describe('Slack reply projection', () => {
  it('returns only root assistant text from a completed new turn', () => {
    const page = {
      latestTurn: { itemId: 'turn-new', turn: { state: 'completed', outcome: 'success' } },
      submissions: [],
      items: [
        {
          turnScope: { kind: 'turn', turnItemId: 'turn-new' },
          body: { kind: 'message', role: 'assistant', blocks: [{ type: 'text', text: 'Result' }] }
        },
        {
          turnScope: { kind: 'turn', turnItemId: 'turn-new' },
          agentId: 'child',
          body: { kind: 'message', role: 'assistant', blocks: [{ type: 'text', text: 'internal' }] }
        },
        {
          turnScope: { kind: 'turn', turnItemId: 'turn-new' },
          body: { kind: 'message', role: 'user', blocks: [{ type: 'text', text: 'question' }] }
        },
        {
          turnScope: { kind: 'turn', turnItemId: 'turn-old' },
          body: { kind: 'message', role: 'assistant', blocks: [{ type: 'text', text: 'old' }] }
        }
      ]
    } as unknown as AgentSessionHistoryPage
    expect(completedSlackReply(page, 'turn-old')).toEqual({
      turnId: 'turn-new',
      outcome: 'success',
      text: 'Result'
    })
    expect(completedSlackReply(page, 'turn-new')).toBeNull()
    expect(completedSlackReply(page, 'turn-old', 'slack-message')).toBeNull()
  })

  it('does not report another user turn as the Slack request result', () => {
    const page = {
      latestTurn: {
        itemId: 'another-turn',
        turn: {
          state: 'completed',
          outcome: 'success',
          userItemId: agentJournalSubmissionKey('desktop-message')
        }
      },
      submissions: [],
      items: [
        {
          turnScope: { kind: 'turn', turnItemId: 'another-turn' },
          body: {
            kind: 'message',
            role: 'assistant',
            blocks: [{ type: 'text', text: 'Desktop answer' }]
          }
        }
      ]
    } as unknown as AgentSessionHistoryPage
    expect(completedSlackReply(page, 'previous-turn', 'slack-message')).toBeNull()
    page.items.unshift({
      itemId: 'slack-turn',
      observedAt: 1,
      body: {
        kind: 'turn',
        turnId: 'provider-turn',
        state: 'completed',
        outcome: 'success',
        userItemId: agentJournalSubmissionKey('slack-message')
      }
    } as AgentSessionHistoryPage['items'][number])
    page.items.push({
      turnScope: { kind: 'turn', turnItemId: 'slack-turn' },
      body: { kind: 'message', role: 'assistant', blocks: [{ type: 'text', text: 'Slack answer' }] }
    } as AgentSessionHistoryPage['items'][number])
    expect(completedSlackReply(page, 'previous-turn', 'slack-message')).toMatchObject({
      turnId: 'slack-turn',
      text: 'Slack answer'
    })
  })
})
