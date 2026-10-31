// One RFC 8030 push: encrypt for the subscription, sign for its push service, POST, classify.
import { cancelUnreadResponseBody } from '../../lib/unread-response-body'
import { encryptWebPushPayload } from './web-push-encryption'
import { vapidAuthorization, type VapidKeys } from './web-push-vapid'

const PUSH_REQUEST_DEADLINE_MS = 10_000
// Why these hosts only: a paired page names the URL the host will POST to, so it must be a push service.
const PUSH_SERVICE_HOSTS = [
  'push.apple.com',
  'fcm.googleapis.com',
  'push.services.mozilla.com',
  'notify.windows.com'
]

export type WebPushSubscriptionTarget = {
  endpoint: string
  /** base64url, as `PushSubscription.toJSON().keys` gives them. */
  p256dh: string
  auth: string
  subject: string
}

/** `gone`: the push service forgot the subscription, so it must be dropped. */
export type WebPushOutcome = 'delivered' | 'gone' | 'rejected' | 'unreachable'

export function isPushServiceEndpoint(endpoint: string): boolean {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  const host = url.hostname.toLowerCase()
  return (
    url.protocol === 'https:' &&
    !url.username &&
    !url.password &&
    // Why: push services answer on 443 only, so another port is never a real subscription.
    url.port === '' &&
    PUSH_SERVICE_HOSTS.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
  )
}

export function classifyWebPushStatus(status: number): WebPushOutcome {
  if (status >= 200 && status < 300) {
    return 'delivered'
  }
  if (status === 404 || status === 410) {
    return 'gone'
  }
  return status === 429 || status >= 500 ? 'unreachable' : 'rejected'
}

export async function sendWebPush(input: {
  subscription: WebPushSubscriptionTarget
  payload: string
  vapid: VapidKeys
  ttlSeconds: number
  urgency: 'high' | 'normal'
  fetchImpl: typeof globalThis.fetch
  nowMs: number
}): Promise<{ outcome: WebPushOutcome; status: number | null }> {
  const { subscription } = input
  const body = encryptWebPushPayload(Buffer.from(input.payload, 'utf8'), {
    p256dh: Buffer.from(subscription.p256dh, 'base64url'),
    auth: Buffer.from(subscription.auth, 'base64url')
  })
  let response: Response
  try {
    response = await input.fetchImpl(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: vapidAuthorization(
          input.vapid,
          subscription.endpoint,
          subscription.subject,
          input.nowMs
        ),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(input.ttlSeconds),
        Urgency: input.urgency
      },
      // Why a copy: fetch's BodyInit takes an ArrayBuffer-backed view, not Buffer's pooled slab.
      body: new Uint8Array(body),
      redirect: 'error',
      signal: AbortSignal.timeout(PUSH_REQUEST_DEADLINE_MS)
    })
  } catch {
    return { outcome: 'unreachable', status: null }
  }
  await cancelUnreadResponseBody(response)
  return { outcome: classifyWebPushStatus(response.status), status: response.status }
}
