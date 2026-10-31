// Aster's phone notifications. It caches nothing: the app always loads from the network, so a
// stale worker can never pin an old client. Its scope is the folder that holds web-index.html.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

function readPayload(event) {
  try {
    const payload = event.data ? event.data.json() : null
    return payload && typeof payload === 'object' ? payload : {}
  } catch {
    return {}
  }
}

// Why always show one: iOS revokes a subscription whose pushes show nothing.
self.addEventListener('push', (event) => {
  const payload = readPayload(event)
  const title = typeof payload.title === 'string' && payload.title ? payload.title : 'Aster'
  const options = {
    body: typeof payload.body === 'string' ? payload.body : '',
    icon: './icon-192.png',
    data: { target: payload.target && typeof payload.target === 'object' ? payload.target : null }
  }
  if (typeof payload.id === 'string' && payload.id) {
    options.tag = payload.id
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

async function openApp(target) {
  const scope = new URL(self.registration.scope)
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const open = windows.find((client) => new URL(client.url).pathname.startsWith(scope.pathname))
  if (open) {
    try {
      await open.focus()
    } catch {
      // Focus can be refused; the message below still moves the app to the target.
    }
    if (target) {
      open.postMessage({ type: 'aster-notify-open', target })
    }
    return
  }
  const url = new URL('./web-index.html', scope)
  if (target) {
    url.searchParams.set('notify', JSON.stringify(target))
  }
  await self.clients.openWindow(url.href)
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data ? event.notification.data.target : null
  event.waitUntil(openApp(target))
})
