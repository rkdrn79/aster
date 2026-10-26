import { createRequire } from 'node:module'

const { resolveAsterUpdateFeed } = createRequire(import.meta.url)('./aster-update-feed.cjs')

try {
  const feed = resolveAsterUpdateFeed()
  if (!feed) {
    throw new Error('Aster release requires ORCA_MAC_RELEASE=1 or ASTER_UPDATE_FEED_URL.')
  }
  process.stdout.write(`Aster release update feed: ${new URL(feed).origin}\n`)
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
