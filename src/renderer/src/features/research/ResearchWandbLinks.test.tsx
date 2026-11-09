// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ResearchRunManifest } from '../../../../shared/research/research-run-manifest'
import type { ResearchProjectWandb } from '../../../../shared/research/research-wandb'

const mocks = vi.hoisted(() => {
  const state: { settings: ResearchProjectWandb | null } = { settings: null }
  return state
})

vi.mock('./research-project-wandb', () => ({
  useProjectWandbSettings: () => mocks.settings
}))

import {
  ResearchWandbExperimentLink,
  ResearchWandbRunButton,
  useResearchRunWandb
} from './ResearchWandbLinks'

const owner = { hostId: 'local', workspaceId: 'w1', workspacePath: '/data/paper' }
const enabled: ResearchProjectWandb = {
  enabled: true,
  entity: 'PoV_JEPA',
  project: 'reusable-jepa',
  python: null
}
const manifest: ResearchRunManifest = {
  schemaVersion: 1,
  externalRunId: 'seed-1',
  wandb: {
    entity: 'PoV_JEPA',
    project: 'reusable-jepa',
    group: 'main',
    runId: 'aster-0123456789abcdef',
    url: null,
    status: 'synced',
    warning: 'the mirror exited with code 3'
  }
}

function RunLink({ run }: { run: ResearchRunManifest | null }): React.JSX.Element {
  const wandb = useResearchRunWandb(owner, run)
  return (
    <>
      {wandb.url ? <ResearchWandbRunButton url={wandb.url} /> : null}
      <span>{wandb.warning ?? 'no warning'}</span>
    </>
  )
}

afterEach(() => {
  cleanup()
  mocks.settings = null
  vi.unstubAllGlobals()
})

it('opens the Experiment group in W&B when the project mirrors to it', () => {
  const openUrl = vi.fn()
  vi.stubGlobal('api', { shell: { openUrl } })
  mocks.settings = enabled
  render(<ResearchWandbExperimentLink experiment={{ ...owner, catalogSlug: 'lora-r16' }} />)

  fireEvent.click(screen.getByRole('button', { name: 'Open in W&B' }))
  expect(openUrl).toHaveBeenCalledWith('https://wandb.ai/PoV_JEPA/reusable-jepa/groups/lora-r16')
})

it('shows no Experiment link when W&B is off or the Experiment has no folder', () => {
  mocks.settings = { ...enabled, enabled: false }
  render(<ResearchWandbExperimentLink experiment={{ ...owner, catalogSlug: 'lora-r16' }} />)
  expect(screen.queryByRole('button')).toBeNull()
  cleanup()
  mocks.settings = enabled
  render(<ResearchWandbExperimentLink experiment={owner} />)
  expect(screen.queryByRole('button')).toBeNull()
})

it('opens the Run in W&B from what run.json recorded', () => {
  const openUrl = vi.fn()
  vi.stubGlobal('api', { shell: { openUrl } })
  mocks.settings = enabled
  render(<RunLink run={manifest} />)

  fireEvent.click(screen.getByRole('button', { name: 'Open in W&B' }))
  expect(openUrl).toHaveBeenCalledWith(
    'https://wandb.ai/PoV_JEPA/reusable-jepa/runs/aster-0123456789abcdef'
  )
  expect(screen.getByText('the mirror exited with code 3')).toBeTruthy()
})

it('shows no Run link for a Run that was never mirrored or while W&B is off', () => {
  mocks.settings = enabled
  render(<RunLink run={{ schemaVersion: 1 }} />)
  expect(screen.queryByRole('button')).toBeNull()
  cleanup()
  mocks.settings = { ...enabled, enabled: false }
  render(<RunLink run={manifest} />)
  expect(screen.queryByRole('button')).toBeNull()
  expect(screen.getByText('no warning')).toBeTruthy()
})
