import { createHash, randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { open, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { HarnessError } from './research-harness-error.mjs'

const lockRetryMs = 25

export async function writeJsonAtomically(target, value) {
  const temporary = `${target}.${randomBytes(6).toString('hex')}.tmp`
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' })
    await rename(temporary, target)
  } finally {
    await unlink(temporary).catch(() => {})
  }
}

// Why: these locks guard millisecond read-modify-write updates, so an old lock is a crashed writer.
export async function withFileLock(lockPath, task, { timeoutMs = 5000, staleMs = 15000 } = {}) {
  const deadline = Date.now() + timeoutMs
  let handle = null
  while (!handle) {
    try {
      handle = await open(lockPath, 'wx')
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw error
      }
      const age = await stat(lockPath).then(
        (details) => Date.now() - details.mtimeMs,
        () => 0
      )
      if (age > staleMs) {
        await unlink(lockPath).catch(() => {})
      } else if (Date.now() > deadline) {
        throw new HarnessError('locked', `File is locked; retry later: ${lockPath}`)
      } else {
        await new Promise((resolve) => setTimeout(resolve, lockRetryMs))
      }
    }
  }
  try {
    return await task()
  } finally {
    await handle.close()
    await unlink(lockPath).catch(() => {})
  }
}

export function sha256OfBuffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

export async function sha256OfFile(target) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(target)) {
    hash.update(chunk)
  }
  return hash.digest('hex')
}
