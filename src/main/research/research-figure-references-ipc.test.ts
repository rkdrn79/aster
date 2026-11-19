import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const paths = vi.hoisted(() => ({ userData: '' }))
vi.mock('electron', () => ({
  app: { getAppPath: () => '/app', getPath: () => paths.userData, isPackaged: false },
  ipcMain: { handle: vi.fn() }
}))
vi.mock('../startup/main-process-state', () => ({ mainProcessState: { store: null } }))

import {
  codexExecutable,
  codexImageGenerationFromFeatures,
  defaultFigureReferenceFolder,
  figureReferenceThumbnail
} from './research-figure-references-ipc'

const folders: string[] = []
afterEach(async () => {
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })))
})

describe('the reference folder from main', () => {
  it("defaults to the app data's figure-references folder", () => {
    paths.userData = '/Users/me/Library/Application Support/Aster'
    expect(defaultFigureReferenceFolder()).toBe(
      '/Users/me/Library/Application Support/Aster/figure-references'
    )
  })

  it('reads a thumbnail only for an image inside the folder', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'aster-refs-ipc-'))
    folders.push(folder)
    await mkdir(join(folder, 'img'))
    await writeFile(join(folder, 'img/mine.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    await writeFile(join(folder, 'notes.txt'), 'x')
    const inside = await figureReferenceThumbnail({ folder, image: join(folder, 'img/mine.png') })
    expect(inside?.startsWith('data:image/png;base64,')).toBe(true)
    expect(await figureReferenceThumbnail({ folder, image: join(folder, 'notes.txt') })).toBeNull()
    expect(await figureReferenceThumbnail({ folder, image: '/etc/hosts.png' })).toBeNull()
  })
})

describe("Codex's image generation", () => {
  it('reads image_generation from codex features list', () => {
    expect(
      codexImageGenerationFromFeatures('apps    stable  true\nimage_generation   stable   true\n')
    ).toEqual({ available: true, reason: null })
    expect(codexImageGenerationFromFeatures('image_generation  removed  false').available).toBe(
      false
    )
    expect(codexImageGenerationFromFeatures('apps stable true').reason).toContain(
      'no image generation'
    )
  })

  it("runs the person's Codex command when it is a plain path", () => {
    expect(codexExecutable("'/opt/codex bin/codex'")).toBe('/opt/codex bin/codex')
    expect(codexExecutable('npx codex')).toBe('codex')
    expect(codexExecutable(undefined)).toBe('codex')
  })
})
