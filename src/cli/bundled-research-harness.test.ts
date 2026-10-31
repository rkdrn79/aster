import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ORCAD_RESEARCH_HARNESS_CLI_FILENAME } from '../shared/orcad-artifacts'
import { resolveBundledResearchHarnessCli } from './bundled-research-harness'

describe('resolveBundledResearchHarnessCli', () => {
  let root: string | null = null
  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('finds the harness beside a packaged app and in a checkout', () => {
    root = mkdtempSync(join(tmpdir(), 'aster-research-harness-'))
    const packaged = join(root, 'Resources', 'research-harness', 'cli.mjs')
    mkdirSync(join(root, 'Resources', 'research-harness'), { recursive: true })
    writeFileSync(packaged, '')
    expect(
      resolveBundledResearchHarnessCli(join(root, 'Resources', 'app.asar.unpacked', 'out', 'cli'))
    ).toBe(packaged)

    const checkout = join(root, 'source', 'src', 'research-harness', 'cli.mjs')
    mkdirSync(join(root, 'source', 'src', 'research-harness'), { recursive: true })
    writeFileSync(checkout, '')
    expect(resolveBundledResearchHarnessCli(join(root, 'source', 'out', 'cli'))).toBe(checkout)
  })

  it('finds the harness an SSH host slot ships beside its CLI', () => {
    root = mkdtempSync(join(tmpdir(), 'aster-research-harness-'))
    const slot = join(root, '.orca-remote', 'orcad-0.1.0+abc')
    const shipped = join(slot, ...ORCAD_RESEARCH_HARNESS_CLI_FILENAME.split('/'))
    mkdirSync(dirname(shipped), { recursive: true })
    writeFileSync(shipped, '')
    expect(resolveBundledResearchHarnessCli(join(slot, 'out', 'cli'))).toBe(shipped)
  })

  it('does not invent a path when the harness is missing', () => {
    root = mkdtempSync(join(tmpdir(), 'aster-research-harness-'))
    expect(resolveBundledResearchHarnessCli(join(root, 'out', 'cli'))).toBeNull()
  })
})
