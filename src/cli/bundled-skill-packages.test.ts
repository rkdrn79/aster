import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveBundledSkillPackagesDirectory } from './bundled-skill-packages'

describe('resolveBundledSkillPackagesDirectory', () => {
  let root: string | null = null
  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  function writePackage(skillsDir: string, name: string): void {
    mkdirSync(join(skillsDir, name), { recursive: true })
    writeFileSync(join(skillsDir, name, 'SKILL.md'), '# skill\n')
  }

  it('finds the packaged Resources/skills beside app.asar.unpacked', () => {
    root = mkdtempSync(join(tmpdir(), 'bundled-skills-'))
    const resources = join(root, 'Resources')
    writePackage(join(resources, 'skills'), 'aster-cli')
    const runtimeDir = join(resources, 'app.asar.unpacked', 'out', 'cli')

    expect(resolveBundledSkillPackagesDirectory(['aster-cli'], runtimeDir)).toBe(
      join(resources, 'skills')
    )
  })

  it('finds a source checkout skills tree and refuses when any package is missing', () => {
    root = mkdtempSync(join(tmpdir(), 'bundled-skills-'))
    writePackage(join(root, 'skills'), 'aster-cli')
    const runtimeDir = join(root, 'out', 'cli')

    expect(resolveBundledSkillPackagesDirectory(['aster-cli'], runtimeDir)).toBe(
      join(root, 'skills')
    )
    expect(resolveBundledSkillPackagesDirectory(['aster-cli', 'aster-gpu'], runtimeDir)).toBeNull()
  })
})
