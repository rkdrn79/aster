import { describe, expect, it } from 'vitest'
import { CLI_NAME, LINUX_CLI_NAME, PRODUCT_BRAND, withProductName } from './product-brand'

const name = PRODUCT_BRAND.name

describe('withProductName', () => {
  it('rebrands upstream prose names, including Korean uppercase and transliterated forms', () => {
    expect(withProductName('Welcome to Orca')).toBe(`Welcome to ${name}`)
    expect(withProductName("Orca's default prompt, Non-Orca worktrees.")).toBe(
      `${name}'s default prompt, Non-${name} worktrees.`
    )
    expect(withProductName('ORCA는 터미널 상태를 저장할 수 없습니다. 오르카는')).toBe(
      `${name}는 터미널 상태를 저장할 수 없습니다. ${name}는`
    )
    expect(withProductName('Move Orca.app to Applications')).toBe(
      `Move ${name}.app to Applications`
    )
  })

  it('keeps env vars, file names, identifiers and non-command words intact', () => {
    const technical =
      '$ORCA_ROOT_PATH, ORCA_BITBUCKET_API_TOKEN, orca.yaml, Orca.yaml, ~/.orca, .orca/, orca-plugin.json, OrcaDev, orca first, stablyai/orca'
    expect(withProductName(technical)).toBe(technical)
  })

  it('names the product CLI in command invocations', () => {
    // Why upstream literals: the catalogs still carry upstream text, which is what this rewrites.
    const upstreamCli = 'orca'
    expect(
      withProductName(
        `Run \`${upstreamCli} worktree create\` or ${upstreamCli} --help; \`${upstreamCli}\` is on PATH.`
      )
    ).toBe(`Run \`${CLI_NAME} worktree create\` or ${CLI_NAME} --help; \`${CLI_NAME}\` is on PATH.`)
    expect(
      withProductName(`Allow this host's ${upstreamCli} CLI; lets ${upstreamCli} commands run.`)
    ).toBe(`Allow this host's ${CLI_NAME} CLI; lets ${CLI_NAME} commands run.`)
    expect(withProductName(`Register \`${upstreamCli}-ide\` in ~/.local/bin.`)).toBe(
      `Register \`${LINUX_CLI_NAME}\` in ~/.local/bin.`
    )
  })

  it('names the bundled skills by their product-prefixed names', () => {
    const id = PRODUCT_BRAND.id
    expect(
      withProductName('Gives agents /orca-linear; install orca-cli, `orca-per-workspace-env`.')
    ).toBe(`Gives agents /${id}-linear; install ${id}-cli, \`${id}-per-workspace-env\`.`)
    expect(withProductName('Use /orchestration or $computer-use to start.')).toBe(
      `Use /${id}-orchestration or $${id}-computer-use to start.`
    )
    const untouched = 'orchestration database, settings/orchestration, linear-orca-cli-shim'
    expect(withProductName(untouched)).toBe(untouched)
  })

  it('moves pairing and share deep links to the product scheme', () => {
    expect(withProductName('orca://pair?code=...')).toBe(
      `${PRODUCT_BRAND.urlScheme}://pair?code=...`
    )
  })
})
