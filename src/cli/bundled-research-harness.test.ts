import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
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

  it('does not invent a path when the harness is missing', () => {
    root = mkdtempSync(join(tmpdir(), 'aster-research-harness-'))
    expect(resolveBundledResearchHarnessCli(join(root, 'out', 'cli'))).toBeNull()
  })
})
