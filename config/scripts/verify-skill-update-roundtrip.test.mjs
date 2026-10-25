import { describe, expect, it } from 'vitest'
import { buildAgentFeatureSkillInstallArgs } from '../../src/shared/agent-feature-install-commands'
import { roundTripAddArgs } from './verify-skill-update-roundtrip.mjs'

const COMMIT = 'a'.repeat(40)
const SOURCE_DIRECTORY = '/opt/app/resources/skills'

describe('skill update round trip', () => {
  it('runs exactly the shared builder’s unattended add, pinned skills CLI included', () => {
    expect(roundTripAddArgs(SOURCE_DIRECTORY, 'aster-cli')).toEqual(
      buildAgentFeatureSkillInstallArgs(['aster-cli'], {
        sourceCommit: COMMIT,
        localSourceDirectory: SOURCE_DIRECTORY,
        yes: true,
        agents: ['claude-code', 'universal']
      })
    )
  })
})
