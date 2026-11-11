import { describe, expect, it } from 'vitest'
import {
  parseResearchWindowAction,
  parseResearchWindowActionResult
} from './research-window-actions'

const delegation = {
  id: '6f1b6a7e-3c1f-4a59-9a43-1f2c7b0d9e21',
  sourceWorkspaceId: 'wt-1',
  sourceHostId: 'local',
  sourceExperimentId: null,
  targetWorkspaceId: 'wt-1',
  targetHostId: 'local',
  targetLabel: 'Project',
  agent: 'claude',
  task: 'Research loop: lower the loss'
}
const launch = {
  agent: 'claude',
  hostId: 'local',
  workspaceId: 'wt-1',
  surface: 'chat',
  prompt: 'Follow the loop skill.',
  promptDelivery: 'auto-submit',
  label: 'Research loop · lower the loss'
}

describe('research window actions', () => {
  it('accepts each action a research window sends', () => {
    expect(
      parseResearchWindowAction({ kind: 'launch-background-agent', launch, delegation })
    ).toEqual({ kind: 'launch-background-agent', launch, delegation })
    expect(
      parseResearchWindowAction({
        kind: 'close-chat',
        workspaceId: 'wt-1',
        tabId: 't',
        entityId: 's'
      })
    ).not.toBeNull()
    expect(
      parseResearchWindowAction({
        kind: 'rename-chat',
        workspaceId: 'wt-1',
        tabId: 't',
        label: 'x'
      })
    ).not.toBeNull()
    expect(
      parseResearchWindowAction({
        kind: 'open-in-editor',
        workspaceId: 'wt-1',
        hostId: 'local',
        file: { absolutePath: '/p/paper/main.tex', relativePath: 'paper/main.tex' },
        besidePdf: null
      })
    ).not.toBeNull()
  })

  it.each([
    ['an unknown kind', { kind: 'run-shell', command: 'rm -rf /' }],
    [
      'an unknown agent',
      { kind: 'launch-background-agent', launch: { ...launch, agent: 'sh' }, delegation }
    ],
    [
      'a Background task without its id',
      { kind: 'launch-background-agent', launch, delegation: { ...delegation, id: 'x' } }
    ],
    [
      'a launch with extra fields',
      { kind: 'launch-background-agent', launch: { ...launch, env: {} }, delegation }
    ],
    [
      'an oversized prompt',
      {
        kind: 'launch-background-agent',
        launch: { ...launch, prompt: 'x'.repeat(2_000_001) },
        delegation
      }
    ],
    [
      'a close without its chat',
      { kind: 'close-chat', workspaceId: 'wt-1', tabId: '', entityId: 's' }
    ],
    ['not an object', 'close-chat']
  ])('refuses %s', (_name, value) => {
    expect(parseResearchWindowAction(value)).toBeNull()
  })

  it('reads how an action went', () => {
    expect(parseResearchWindowActionResult({ ok: true, delegationId: 'd' })).toEqual({
      ok: true,
      delegationId: 'd'
    })
    expect(parseResearchWindowActionResult({ ok: false, error: 'no', stage: 'record' })).toEqual({
      ok: false,
      error: 'no',
      stage: 'record'
    })
    expect(parseResearchWindowActionResult({ ok: false })).toBeNull()
  })
})
