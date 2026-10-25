import { createRequire } from 'node:module'

const { resolveAsterUpdateFeed } = createRequire(import.meta.url)('./aster-update-feed.cjs')

try {
  const feed = resolveAsterUpdateFeed()
  if (!feed) {
    throw new Error('Set ASTER_UPDATE_FEED_URL to the HTTPS update feed for this release.')
  }
  process.stdout.write(`Aster release update feed: ${new URL(feed).origin}\n`)
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
