import { describe, expect, it } from 'vitest'
import { slackCoordinatorPrompt } from './slack-coordinator-prompt'

describe('Slack coordinator prompt', () => {
  it('binds the request to its project and tells the coordinator to reuse or start a worker', () => {
    const prompt = slackCoordinatorPrompt({
      projectName: 'Project A',
      message: {
        eventId: 'Ev1',
        teamId: 'T1',
        channel: 'C1',
        threadTs: '1720000000.000001',
        eventTs: '1720000000.000001',
        user: 'U1',
        text: 'Run an ablation'
      }
    })
    expect(prompt).toContain('Project: Project A')
    expect(prompt).toContain('suitable active project agent exists')
    expect(prompt).toContain('start a new background worker')
    expect(prompt).toContain('research harness')
    expect(prompt).toContain('It will post your final answer to the original thread')
    expect(prompt).toContain('Do not use them to open, verify, or reply to the thread')
    expect(prompt).not.toContain('team T1')
    expect(prompt).not.toContain('channel C1')
    expect(prompt).toContain('<slack_request>\nRun an ablation\n</slack_request>')
  })
})
