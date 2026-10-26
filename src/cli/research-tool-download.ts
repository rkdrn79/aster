import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, rm, stat, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'

const runFile = promisify(execFile)

export async function downloadVerified(
  url: string,
  sha256: string,
  destination: string
): Promise<void> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(180_000) })
    if (!response.ok || !response.body) {
      throw new Error(`Download failed (HTTP ${response.status})`)
    }
    const chunks: Buffer[] = []
    const hash = createHash('sha256')
    let size = 0
    for await (const chunk of response.body) {
      const bytes = Buffer.from(chunk)
      size += bytes.length
      if (size > 200 * 1024 * 1024) {
        throw new Error('Download exceeds the 200 MiB limit')
      }
      hash.update(bytes)
      chunks.push(bytes)
    }
    if (hash.digest('hex') !== sha256) {
      throw new Error('Downloaded tool failed its SHA-256 check')
    }
    await writeFile(destination, Buffer.concat(chunks), { mode: 0o600 })
    return
  } catch (error) {
    // Some SSH hosts require their curl/wget proxy setup; still verify the pinned bytes below.
    if (error instanceof Error && /SHA-256|200 MiB/.test(error.message)) {
      throw error
    }
  }
  let downloaded = false
  for (const [program, args] of [
    [
      'curl',
      [
        '--fail',
        '--location',
        '--silent',
        '--show-error',
        '--max-time',
        '180',
        '--output',
        destination,
        url
      ]
    ],
    ['wget', ['--quiet', '--timeout=180', '--output-document', destination, url]]
  ] as const) {
    try {
      await runFile(program, args, { timeout: 190_000 })
      downloaded = true
      break
    } catch {
      await rm(destination, { force: true })
    }
  }
  if (!downloaded) {
    throw new Error('Could not download the pinned research tool on this server')
  }
  if ((await stat(destination)).size > 200 * 1024 * 1024) {
    throw new Error('Download exceeds the 200 MiB limit')
  }
  const contents = await readFile(destination)
  if (createHash('sha256').update(contents).digest('hex') !== sha256) {
    throw new Error('Downloaded tool failed its SHA-256 check')
  }
}
