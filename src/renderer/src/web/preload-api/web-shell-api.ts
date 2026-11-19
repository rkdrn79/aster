import type { PreloadApi } from '../../../../preload/api-types'
import { resolveRuntimeFilePath } from './web-runtime-worktree-catalog'
import { pickWebFiles } from './web-picked-files'

async function pathExistsOnRuntime(path: string): Promise<boolean> {
  try {
    await resolveRuntimeFilePath(path)
    return true
  } catch {
    return false
  }
}

export function createShellApi(): NonNullable<Partial<PreloadApi>['shell']> {
  const openResult = { ok: true } as const
  return {
    openPath: (path) =>
      Promise.resolve(window.open(path, '_blank', 'noopener,noreferrer') as never),
    openInFileManager: () => Promise.resolve(openResult),
    openInExternalEditor: () => Promise.resolve(openResult),
    openUrl: (url) => Promise.resolve(window.open(url, '_blank', 'noopener,noreferrer') as never),
    openFilePath: () => Promise.resolve(false),
    openFileUri: (uri) =>
      Promise.resolve(window.open(uri, '_blank', 'noopener,noreferrer') as never),
    pathExists: async (path) => pathExistsOnRuntime(path),
    // Without this the fallback proxy answers `undefined` and the caller's batch rejects.
    pathsExist: (paths) => Promise.all(paths.map((path) => pathExistsOnRuntime(path))),
    pickAttachment: () => Promise.resolve(null),
    // Why the browser picker: on a phone it offers the photo library and the camera.
    pickAttachments: () => pickWebFiles({ multiple: true }),
    pickImage: () => Promise.resolve(null),
    pickRepoIconImage: () => Promise.resolve(null),
    pickAudio: () => Promise.resolve(null),
    pickDirectory: () => Promise.resolve(null),
    copyFile: () => Promise.resolve()
  }
}
