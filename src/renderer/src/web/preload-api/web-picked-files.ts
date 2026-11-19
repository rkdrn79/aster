import { createBrowserUuid } from '@/lib/browser-uuid'

// Why a made-up absolute path: the chat's attach flow passes local paths around (chip names,
// image checks by extension), and a browser file has none; this one maps back to the File.
const PICKED_ROOT = '/.aster-web-picked'
const picked = new Map<string, File>()
let pendingPick: { finish: (paths: string[]) => void } | null = null

/** The picked file a path stands for, given up once, so the browser can release its memory. */
export function takeWebPickedFile(path: string): File | undefined {
  const file = picked.get(path)
  picked.delete(path)
  return file
}

function rememberPickedFile(file: File): string {
  const name = file.name.replace(/[\\/]/g, '_') || 'attachment'
  const path = `${PICKED_ROOT}/${createBrowserUuid()}/${name}`
  picked.set(path, file)
  return path
}

/**
 * The browser's own file picker; on a phone it offers the photo library and the camera. Must run
 * inside the tap that asked for it, because browsers open pickers only on a user gesture.
 */
export function pickWebFiles(options: { accept?: string; multiple: boolean }): Promise<string[]> {
  // Why: a picker dismissed without a `cancel` event (older Safari) must not hold the next one.
  pendingPick?.finish([])
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = options.multiple
    if (options.accept) {
      input.accept = options.accept
    }
    input.hidden = true
    let settled = false
    const pick = {
      finish: (paths: string[]): void => {
        if (settled) {
          return
        }
        settled = true
        if (pendingPick === pick) {
          pendingPick = null
        }
        input.remove()
        resolve(paths)
      }
    }
    pendingPick = pick
    input.addEventListener('change', () =>
      pick.finish(Array.from(input.files ?? [], rememberPickedFile))
    )
    input.addEventListener('cancel', () => pick.finish([]))
    // Why attached: iOS Safari ignores a click on a file input that is not in the document.
    document.body.append(input)
    input.click()
  })
}

/** A picked file's bytes as base64, the form the attachment upload sends. */
export async function readWebPickedFileBase64(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('The file could not be read.'))
    )
    reader.addEventListener('error', () =>
      reject(reader.error ?? new Error('The file could not be read.'))
    )
    reader.readAsDataURL(file)
  })
  return dataUrl.slice(dataUrl.indexOf(',') + 1)
}
