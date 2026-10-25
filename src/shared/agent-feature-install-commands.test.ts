import { describe, expect, it } from 'vitest'
import {
  buildAgentFeatureSkillInstallArgs,
  buildAgentFeatureSkillInstallCommand,
  SKILL_INSTALL_UNAVAILABLE_COMMAND,
  SKILL_INSTALL_UNAVAILABLE_MESSAGE,
  SKILLS_CLI_VERSION
} from './agent-feature-install-commands'
import { PRODUCT_BRAND } from './product-brand'

const sourceCommit = '0123456789abcdef0123456789abcdef01234567'
const localSourceDirectory = 'C:\\Program Files\\Aster\\resources\\skills'

// The product publishes no skill repository, so only its bundled packages can be installed.
describe('agent feature skill commands', () => {
  it('installs from the bundled packages with the pinned skills CLI', () => {
    expect(
      buildAgentFeatureSkillInstallArgs(['aster-cli', 'aster-orchestration'], {
        sourceCommit,
        localSourceDirectory
      })
    ).toEqual([
      `skills@${SKILLS_CLI_VERSION}`,
      'add',
      localSourceDirectory,
      '--skill',
      'aster-cli',
      '--skill',
      'aster-orchestration',
      '--global'
    ])
  })

  it('never falls back to an upstream repository when no packages are available', () => {
    expect(() => buildAgentFeatureSkillInstallArgs(['aster-cli'], { sourceCommit })).toThrow(
      SKILL_INSTALL_UNAVAILABLE_MESSAGE
    )
    expect(SKILL_INSTALL_UNAVAILABLE_COMMAND).not.toMatch(/github|npx/)
  })

  it('hands copyable installs to the app CLI, which installs its bundled packages', () => {
    expect(
      buildAgentFeatureSkillInstallCommand(['aster-cli', 'aster-orchestration'], { sourceCommit })
    ).toBe(`${PRODUCT_BRAND.cliName} skills install --skill aster-cli --skill aster-orchestration`)
    expect(
      buildAgentFeatureSkillInstallCommand(['aster-cli'], {
        sourceCommit,
        global: false,
        yes: true,
        agents: ['claude-code', 'universal']
      })
    ).toBe(
      `${PRODUCT_BRAND.cliName} skills install --skill aster-cli --local --agent claude-code,universal`
    )
  })

  it('rejects an empty skill list', () => {
    expect(() => buildAgentFeatureSkillInstallArgs([], { sourceCommit })).toThrow(
      'At least one skill name is required.'
    )
  })

  it('refuses to skip prompts without an install target', () => {
    // Why: -y with no --agent is the one combination that makes `skills add`
    // install into every agent it knows (~75). No caller may express it.
    expect(() =>
      buildAgentFeatureSkillInstallCommand(['aster-cli'], { sourceCommit, yes: true })
    ).toThrow('An install target is required when skipping prompts.')
  })

  it('refuses a target the skills CLI would drop', () => {
    // Why: defence in depth behind the CLI's own check — the skills CLI silently
    // drops a `-`-leading --agent value, which empties its target list and
    // installs into every agent it knows.
    expect(() =>
      buildAgentFeatureSkillInstallArgs(['aster-cli'], {
        sourceCommit,
        localSourceDirectory,
        yes: true,
        agents: ['universal', 'a b']
      })
    ).toThrow('"a b" is not a usable install target.')
  })

  it('appends -y and the targets for an unattended run', () => {
    expect(
      buildAgentFeatureSkillInstallArgs(['aster-cli'], {
        sourceCommit,
        localSourceDirectory,
        global: false,
        yes: true,
        agents: ['universal']
      })
    ).toEqual([
      `skills@${SKILLS_CLI_VERSION}`,
      'add',
      localSourceDirectory,
      '--skill',
      'aster-cli',
      '--agent',
      'universal',
      '-y'
    ])
  })
})
