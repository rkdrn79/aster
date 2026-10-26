import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parse } from 'yaml'

const repoRoot = resolve(import.meta.dirname, '../..')

async function sha512(path) {
  const hash = createHash('sha512')
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk)
  }
  return hash.digest('base64')
}

export async function verifyAsterMacUpdateArtifacts(directory, version) {
  const manifest = parse(await readFile(join(directory, 'latest-mac.yml'), 'utf8'))
  const names = ['Aster-mac-arm64.dmg', 'Aster-mac-arm64.zip']
  if (manifest?.version !== version || !Array.isArray(manifest.files)) {
    throw new Error('Aster updater manifest has the wrong version or no files.')
  }
  for (const name of names) {
    const entries = manifest.files.filter((file) => file?.url === name)
    if (entries.length !== 1) {
      throw new Error(`Aster updater manifest must contain exactly one ${name}.`)
    }
    const entry = entries[0]
    const path = join(directory, name)
    const size = (await stat(path)).size
    if (size <= 0 || size !== entry.size || (await sha512(path)) !== entry.sha512) {
      throw new Error(`Aster updater artifact does not match the manifest: ${name}`)
    }
  }
  if (manifest.files.length !== names.length || !names.includes(manifest.path)) {
    throw new Error('Aster updater manifest lists an unexpected artifact.')
  }
  const primary = manifest.files.find((file) => file.url === manifest.path)
  if (manifest.sha512 !== primary.sha512) {
    throw new Error('Aster updater manifest primary checksum does not match its file entry.')
  }
  return names
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const directory = resolve(process.argv[2] ?? join(repoRoot, 'dist'))
  const { version } = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'))
  try {
    const names = await verifyAsterMacUpdateArtifacts(directory, version)
    process.stdout.write(
      `Verified Aster ${version} update assets: ${names.join(', ')}, latest-mac.yml\n`
    )
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
