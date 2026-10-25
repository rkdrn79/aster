function resolveAsterUpdateFeed(env = process.env) {
  const value = env.ASTER_UPDATE_FEED_URL?.trim()
  if (!value) {
    return null
  }
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('ASTER_UPDATE_FEED_URL must be an absolute HTTPS URL.')
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('ASTER_UPDATE_FEED_URL must be HTTPS without credentials, query, or fragment.')
  }
  return url.href.replace(/\/+$/, '')
}

module.exports = { resolveAsterUpdateFeed }
