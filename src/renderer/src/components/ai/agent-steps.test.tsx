// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AgentStepRow } from './agent-steps'

afterEach(cleanup)

function row(status: 'pending' | 'running' | 'done') {
  return (
    <ul>
      <AgentStepRow status={status}>Collect AP</AgentStepRow>
    </ul>
  )
}

describe('AgentStepRow', () => {
  it('draws the check only for a step that finishes while shown', () => {
    const { container, rerender } = render(row('running'))
    expect(container.querySelector('[data-step-icon="running"]')).not.toBeNull()
    // The turning mark is the only motion on a running step: no band travels under it.
    expect(container.querySelector('.ai-step-trail')).toBeNull()

    rerender(row('done'))
    expect(container.querySelector('.ai-step-trail')).toBeNull()
    expect(container.querySelector('[data-step-icon="done"] .draw-stroke')).not.toBeNull()
    expect(container.querySelector('[data-step-icon="done"] .ai-step-fill')).not.toBeNull()
  })

  it('shows an already finished step still, so a remount never replays it', () => {
    const { container } = render(row('done'))
    expect(container.querySelector('[data-step-icon="done"]')).not.toBeNull()
    expect(container.querySelector('.draw-stroke')).toBeNull()
    expect(container.querySelector('.ai-step-fill')).toBeNull()
  })
})
