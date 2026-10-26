import { describe, expect, it } from 'vitest'
import { parseSlackChannelIds } from './research-slack-channel-input'

describe('parseSlackChannelIds', () => {
  it('accepts channel IDs and Slack channel links', () => {
    expect(
      parseSlackChannelIds(
        'C123ABC, https://app.slack.com/client/T123ABC/G456DEF,\nhttps://example.slack.com/archives/C789ABC/p123'
      )
    ).toEqual(['C123ABC', 'G456DEF', 'C789ABC'])
  })

  it('explains how to replace a channel name with a supported value', () => {
    expect(() => parseSlackChannelIds('#general')).toThrow('paste its channel link')
  })

  it('rejects links outside Slack', () => {
    expect(() => parseSlackChannelIds('https://not-slack.com/archives/C123ABC')).toThrow(
      'Slack channel ID'
    )
  })
})
