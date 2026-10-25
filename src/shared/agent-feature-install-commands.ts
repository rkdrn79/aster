import { isUsableSkillsCliAgentKey } from './skills-cli-agent-keys'
import { PRODUCT_BRAND, PRODUCT_NAME } from './product-brand'

// Null when the product publishes no skill repository; installs then need the bundled packages.
export const SKILLS_SOURCE_REPOSITORY_URL = PRODUCT_BRAND.links.skillRepository

export const SKILL_INSTALL_UNAVAILABLE_MESSAGE = `${PRODUCT_NAME} cannot install agent skills from this build yet: its bundled skill packages are not available here.`

// Why a printing command: Settings and onboarding paste this into a terminal, so it must say why
// instead of fetching another product's skills. Double quotes survive sh, cmd, PowerShell and WSL.
export const SKILL_INSTALL_UNAVAILABLE_COMMAND = `echo "${SKILL_INSTALL_UNAVAILABLE_MESSAGE}"`

// Why: one skills CLI for every install rail. 1.5.x cannot fetch a commit, and a bare
// `npx skills` can reuse a stale cached copy or another binary (#18687).
export const SKILLS_CLI_VERSION = '1.7.2'

// Why: for a commit ref the skills CLI tries `clone --branch <sha>` first and falls back to
// fetching the commit only when git's error is in English, so a translated git fails every
// install (#28914, vercel-labs/skills#2505). Spread over the env of every spawned run.
export const SKILLS_CLI_ENV_OVERRIDES = { LC_ALL: 'C' } as const

// Why `aster-` names: upstream Orca installs its own skills under the bare names into the same
// agent skill dirs, so sharing a name would overwrite (or be mistaken for) the other product's.
export const ORCA_CLI_SKILL_NAME = 'aster-cli'
export const COMPUTER_USE_SKILL_NAME = 'aster-computer-use'
export const ORCHESTRATION_SKILL_NAME = 'aster-orchestration'
export const EPHEMERAL_VMS_SKILL_NAME = 'aster-per-workspace-env'
export const ORCA_LINEAR_SKILL_NAME = 'aster-linear'
export const LINEAR_TICKETS_SKILL_NAME = 'aster-linear-tickets'
export const LINEAR_AGENT_SKILL_NAMES = [ORCA_LINEAR_SKILL_NAME, LINEAR_TICKETS_SKILL_NAME] as const

// Why: `yes` and `agents` default off so every Settings/onboarding string a human
// pastes keeps its interactive prompts and the CLI's own agent detection. Only an
// unattended spawn, which nothing can answer, opts in.
export type AgentFeatureSkillCommandOptions = {
  /** Full commit the running build was made from; null when the build did not stamp one. */
  sourceCommit: string | null
  /** This build's own skill packages on the machine that runs the install. */
  localSourceDirectory?: string | null
  global?: boolean
  yes?: boolean
  agents?: readonly string[]
}

/** The `skills add` source for this build, or null when neither a repository nor bundled packages exist. */
export function resolveSkillInstallSource(
  options: Pick<AgentFeatureSkillCommandOptions, 'sourceCommit' | 'localSourceDirectory'>
): string | null {
  if (SKILLS_SOURCE_REPOSITORY_URL !== null) {
    // Why: pinned to the build's own commit so the installed bytes are the ones its bundled
    // manifest judges freshness against, on every channel (hourly builds have no tag in
    // this repo). `add` always re-copies, so the same command is install and update.
    return options.sourceCommit
      ? `${SKILLS_SOURCE_REPOSITORY_URL}/tree/${options.sourceCommit}`
      : null
  }
  return options.localSourceDirectory ?? null
}

export function buildAgentFeatureSkillInstallArgs(
  skillNames: readonly string[],
  options: AgentFeatureSkillCommandOptions
): string[] {
  assertSkillInstallRequest(skillNames, options)
  const source = resolveSkillInstallSource(options)
  if (source === null) {
    throw new Error(SKILL_INSTALL_UNAVAILABLE_MESSAGE)
  }
  return skillInstallArgs(skillNames, options, source)
}

function assertSkillInstallRequest(
  skillNames: readonly string[],
  options: AgentFeatureSkillCommandOptions
): void {
  if (skillNames.length === 0) {
    throw new Error('At least one skill name is required.')
  }
  // Why: -y with no --agent is the one combination that makes `skills add` install
  // into every agent it knows. Refuse it here so no caller can express it.
  const agents = options.agents ?? []
  if (options.yes && agents.length === 0) {
    throw new Error('An install target is required when skipping prompts.')
  }
  // Why: a value the skills CLI would drop leaves it with no target at all, which
  // is the same all-agents install as passing no --agent.
  const unusable = agents.find((agent) => !isUsableSkillsCliAgentKey(agent))
  if (unusable !== undefined) {
    throw new Error(`"${unusable}" is not a usable install target.`)
  }
}

function skillInstallArgs(
  skillNames: readonly string[],
  options: AgentFeatureSkillCommandOptions,
  source: string
): string[] {
  const global = options.global ?? true
  const agents = options.agents ?? []
  // Why: one flag per name remains compatible with both single-value and variadic parsers.
  const skillArgs = skillNames.flatMap((name) => ['--skill', name])
  return [
    `skills@${SKILLS_CLI_VERSION}`,
    'add',
    source,
    ...skillArgs,
    ...(global ? ['--global'] : []),
    // Why: an explicit --agent stops `skills add` calling its own detection, whose
    // zero-detected branch installs into all ~75 known agents and litters a bare
    // host with agent config directories it has no agent for.
    ...agents.flatMap((agent) => ['--agent', agent]),
    // Why: without -y `skills add` opens an interactive agent picker and blocks
    // forever on any TTY, which is every ssh session.
    ...(options.yes ? ['-y'] : [])
  ]
}

/** A copyable command; a local package path never appears here because it is unquoted shell text. */
export function buildAgentFeatureSkillInstallCommand(
  skillNames: readonly string[],
  options: Omit<AgentFeatureSkillCommandOptions, 'localSourceDirectory'>
): string {
  assertSkillInstallRequest(skillNames, options)
  if (SKILLS_SOURCE_REPOSITORY_URL === null) {
    return bundledSkillInstallCliCommand(skillNames, options)
  }
  const source = resolveSkillInstallSource(options)
  return source === null
    ? SKILL_INSTALL_UNAVAILABLE_COMMAND
    : `npx ${skillInstallArgs(skillNames, options, source).join(' ')}`
}

// Why the app's CLI: it finds the packages shipped beside it, so a pasted command needs no path,
// and a host without them (a remote server bundle) says so instead of fetching another product.
function bundledSkillInstallCliCommand(
  skillNames: readonly string[],
  options: Omit<AgentFeatureSkillCommandOptions, 'localSourceDirectory'>
): string {
  const agents = options.agents ?? []
  return [
    PRODUCT_BRAND.cliName,
    'skills',
    'install',
    ...skillNames.flatMap((name) => ['--skill', name]),
    ...(options.global === false ? ['--local'] : []),
    ...(agents.length > 0 ? ['--agent', agents.join(',')] : [])
  ].join(' ')
}
