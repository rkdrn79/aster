import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveResearchMediaFile } from './research-media-file-access'

describe('research media file access', () => {
  let root: string
  let project: string

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'aster-research-media-')))
    project = join(root, 'project')
    await mkdir(join(project, 'runs', 'a', 'clip.mp4'), { recursive: true })
    await writeFile(join(project, 'runs', 'a', 'step_10.PNG'), 'png')
    await writeFile(join(project, 'runs', 'a', 'voice.opus'), 'opus')
    await writeFile(join(project, 'notes.txt'), 'secret')
    await writeFile(join(root, 'outside.png'), 'outside')
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('returns the real file, its kind and size for project media', async () => {
    await expect(resolveResearchMediaFile(project, 'runs/a/step_10.PNG')).resolves.toEqual({
      filePath: join(project, 'runs', 'a', 'step_10.PNG'),
      kind: 'image',
      mimeType: 'image/png',
      bytes: 3
    })
    await expect(resolveResearchMediaFile(project, 'runs/a/voice.opus')).resolves.toMatchObject({
      kind: 'audio',
      mimeType: 'audio/ogg'
    })
  })

  it('refuses paths that leave the project, other types, directories and missing files', async () => {
    const refusals: [string, string][] = [
      ['../outside.png', 'outside this project'],
      [join(root, 'outside.png'), 'relative to the project'],
      ['C:\\outside.png', 'relative to the project'],
      ['notes.txt', 'Only image, video and audio'],
      ['runs/a/clip.mp4', 'not a file'],
      ['runs/a/missing.webm', 'missing']
    ]
    for (const [relativePath, message] of refusals) {
      await expect(resolveResearchMediaFile(project, relativePath)).rejects.toThrow(message)
    }
  })

  it.skipIf(process.platform === 'win32')(
    'follows symlinks only to media of the same kind inside the project',
    async () => {
      await symlink(join(root, 'outside.png'), join(project, 'escape.png'))
      await symlink(join(project, 'notes.txt'), join(project, 'disguised.png'))
      await symlink(join(project, 'runs', 'a', 'step_10.PNG'), join(project, 'latest.png'))
      await expect(resolveResearchMediaFile(project, 'escape.png')).rejects.toThrow(
        'outside this project'
      )
      await expect(resolveResearchMediaFile(project, 'disguised.png')).rejects.toThrow(
        'Only image, video and audio'
      )
      await expect(resolveResearchMediaFile(project, 'latest.png')).resolves.toMatchObject({
        filePath: join(project, 'runs', 'a', 'step_10.PNG'),
        kind: 'image'
      })
    }
  )

  it('never names the requested path in a refusal', async () => {
    const error = await resolveResearchMediaFile(project, 'runs/seed-42/missing.png').catch(
      (cause: unknown) => cause
    )
    expect(error).toBeInstanceOf(Error)
    expect(String(error)).not.toContain('seed-42')
  })
})
