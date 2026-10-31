// Owner-only files in the host's userData: the VAPID key and the phones subscribed with it.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { readNodeFileSyncWithinLimit } from '../../../shared/node-bounded-file-reader'
import {
  hardenExistingSecureFile,
  isUnreadableError,
  writeSecureJsonFile
} from '../../../shared/secure-file'
import { generateVapidJwk, vapidKeysFromJwk, type VapidKeys } from '../web-push/web-push-vapid'

const VAPID_KEY_FILENAME = 'phone-notify-vapid.json'
const SUBSCRIPTIONS_FILENAME = 'phone-notify-subscriptions.json'
const MAX_VAPID_KEY_FILE_BYTES = 8 * 1024
const MAX_SUBSCRIPTIONS_FILE_BYTES = 256 * 1024

const VapidKeyFileSchema = z.object({
  v: z.literal(1),
  jwk: z.object({
    kty: z.literal('EC'),
    crv: z.literal('P-256'),
    d: z.string(),
    x: z.string(),
    y: z.string()
  })
})

export const PhoneNotifySubscriptionSchema = z.object({
  deviceId: z.string().min(1),
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  /** The VAPID `sub` claim: the subscribing page's origin. */
  subject: z.string().min(1),
  /** The host key the phone subscribed with; a regenerated key orphans the subscription. */
  vapidPublicKey: z.string().min(1),
  createdAt: z.number()
})

export type PhoneNotifySubscription = z.infer<typeof PhoneNotifySubscriptionSchema>

const SubscriptionsFileSchema = z.object({
  v: z.literal(1),
  subscriptions: z.array(PhoneNotifySubscriptionSchema)
})

function readJsonWithinLimit(filePath: string, maxBytes: number): unknown {
  hardenExistingSecureFile(filePath)
  return JSON.parse(readNodeFileSyncWithinLimit(filePath, maxBytes).buffer.toString('utf8'))
}

/** The host's VAPID key, made on first use. A damaged file is replaced; an unreadable one throws. */
export function loadOrCreateVapidKeys(userDataPath: string): VapidKeys {
  const filePath = join(userDataPath, VAPID_KEY_FILENAME)
  if (existsSync(filePath)) {
    try {
      const parsed = VapidKeyFileSchema.safeParse(
        readJsonWithinLimit(filePath, MAX_VAPID_KEY_FILE_BYTES)
      )
      const keys = parsed.success ? vapidKeysFromJwk(parsed.data.jwk) : null
      if (keys) {
        return keys
      }
    } catch (error) {
      // Why: regenerating over a file we merely cannot read would silently orphan every phone.
      if (isUnreadableError(error)) {
        throw new Error(`Cannot read the phone notification key at ${filePath}.`, {
          cause: error
        })
      }
    }
  }
  const jwk = generateVapidJwk()
  const keys = vapidKeysFromJwk(jwk)
  if (!keys) {
    throw new Error('Node generated an unusable P-256 key.')
  }
  writeSecureJsonFile(filePath, { v: 1, jwk })
  return keys
}

/** Null when the file exists but cannot be read, so a caller never overwrites what it cannot see. */
export function readPhoneNotifySubscriptions(
  userDataPath: string
): PhoneNotifySubscription[] | null {
  const filePath = join(userDataPath, SUBSCRIPTIONS_FILENAME)
  if (!existsSync(filePath)) {
    return []
  }
  try {
    const parsed = SubscriptionsFileSchema.safeParse(
      readJsonWithinLimit(filePath, MAX_SUBSCRIPTIONS_FILE_BYTES)
    )
    return parsed.success ? parsed.data.subscriptions : []
  } catch (error) {
    if (isUnreadableError(error)) {
      return null
    }
    console.warn('[phone-notify] Ignoring a damaged subscriptions file:', error)
    return []
  }
}

export function writePhoneNotifySubscriptions(
  userDataPath: string,
  subscriptions: readonly PhoneNotifySubscription[]
): void {
  writeSecureJsonFile(join(userDataPath, SUBSCRIPTIONS_FILENAME), { v: 1, subscriptions })
}
