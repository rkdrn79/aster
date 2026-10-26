import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stringify } from 'yaml'
import { describe, expect, it } from 'vitest'
import { verifyAsterMacUpdateArtifacts } from './verify-aster-mac-update-artifacts.mjs'

async function withArtifacts(run) {
  const directory = await mkdtemp(join(tmpdir(), 'aster-update-assets-'))
  const names = ['Aster-mac-arm64.dmg', 'Aster-mac-arm64.zip']
  const files = []
  try {
    for (const name of names) {
      const content = Buffer.from(name)
      await writeFile(join(directory, name), content)
      files.push({
        url: name,
        size: content.length,
        sha512: createHash('sha512').update(content).digest('base64')
      })
    }
    const manifest = {
      version: '0.1.1',
      files,
      path: names[1],
      sha512: files[1].sha512
    }
    await writeFile(join(directory, 'latest-mac.yml'), stringify(manifest))
    await run(directory, manifest)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

describe('Aster macOS updater artifacts', () => {
  it('accepts a complete release and rejects an artifact changed after manifest creation', async () => {
    await withArtifacts(async (directory) => {
      await expect(verifyAsterMacUpdateArtifacts(directory, '0.1.1')).resolves.toEqual([
        'Aster-mac-arm64.dmg',
        'Aster-mac-arm64.zip'
      ])
      await writeFile(join(directory, 'Aster-mac-arm64.zip'), 'tampered')
      await expect(verifyAsterMacUpdateArtifacts(directory, '0.1.1')).rejects.toThrow(
        'does not match the manifest'
      )
    })
  })

  it('rejects a manifest for a different app version', async () => {
    await withArtifacts(async (directory) => {
      await expect(verifyAsterMacUpdateArtifacts(directory, '0.1.2')).rejects.toThrow(
        'wrong version'
      )
    })
  })
})
