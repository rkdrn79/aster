import { z } from 'zod'

const Base64url = z.string().regex(/^[A-Za-z0-9_-]+$/)

export const PhoneNotifySubscribeParams = z.object({
  /** `PushSubscription.endpoint`; the host accepts only known push services. */
  endpoint: z.string().url().max(2048),
  keys: z.object({ p256dh: Base64url.max(128), auth: Base64url.max(64) }),
  /** The host key the phone subscribed with, so a key the host since replaced is refused. */
  applicationServerKey: Base64url.max(128),
  /** The page's origin, sent to the push service as the VAPID contact. */
  subject: z.string().url().max(512)
})
