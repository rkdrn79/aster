import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SFTPWrapper } from 'ssh2'
import { scanResearchTransfer } from './research-project-transfer-scan'

let root: string
let outside: string

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'aster-transfer-project-')))
  outside = await mkdtemp(join(tmpdir(), 'aster-transfer-outside-'))
  await mkdir(join(root, 'src'))
  await writeFile(join(root, 'src', 'train.py'), 'print(1)')
  await writeFile(join(root, 'src', '.env'), 'TOKEN=secret')
  await writeFile(join(root, '.env'), 'TOKEN=secret')
  await writeFile(join(outside, 'secret.txt'), 'private')
  await symlink(outside, join(root, 'linked'))
  await symlink(outside, join(root, 'src', 'linked'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
})

function scan(paths: string[]) {
  return scanResearchTransfer(
    {
      linkId: 'f76b1f21-6371-42c4-91b4-0f85a14e4075',
      localRoot: root,
      direction: 'push',
      paths
    },
    { local: root, remote: '/remote/project', sftp: {} as SFTPWrapper }
  )
}

describe('project transfer source scan', () => {
  it('collects only selected project files and skips hidden credentials and links', async () => {
    const result = await scan(['src'])
    expect(result.files.map((file) => file.relativePath)).toEqual(['src/train.py'])
    expect(result.bytes).toBe(8)
    expect(result.skipped).toEqual(['src/.env', 'src/linked'])
  })

  it('refuses explicit credentials and symbolic links', async () => {
    await expect(scan(['.env'])).rejects.toThrow('excluded')
    await expect(scan(['linked'])).rejects.toThrow('symbolic link')
    await expect(scan(['linked/secret.txt'])).rejects.toThrow('escapes the project')
  })
})
