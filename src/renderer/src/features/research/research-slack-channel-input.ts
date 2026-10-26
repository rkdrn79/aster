const channelId = /^[CG][A-Z0-9]+$/

function fromSlackLink(value: string): string | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || !/(^|\.)slack\.com$/.test(url.hostname)) {
    return null
  }
  const parts = url.pathname.split('/').filter(Boolean)
  const candidate =
    parts[0] === 'archives' || parts[0] === 'messages'
      ? parts[1]
      : parts[0] === 'client'
        ? parts[2]
        : parts[0] === 'app_redirect'
          ? url.searchParams.get('channel')
          : null
  return candidate && channelId.test(candidate) ? candidate : null
}

export function parseSlackChannelIds(value: string): string[] {
  const entries = value
    .split(/[,\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
  if (entries.length === 0) {
    throw new Error('Add a Slack channel ID or channel link.')
  }
  return entries.map((entry) => {
    if (channelId.test(entry)) {
      return entry
    }
    const linkedId = fromSlackLink(entry)
    if (linkedId) {
      return linkedId
    }
    throw new Error(
      'Enter a Slack channel ID (C… or G…) or paste its channel link. In Slack, open the channel and choose Copy link.'
    )
  })
}
