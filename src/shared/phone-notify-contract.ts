import { z } from 'zod'

/** Web Push to the phone web client, sent by the host itself (orcad). */

/** What a tap on the notification opens; parsed, since it reaches the app through a URL. */
export const PhoneNotifyTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('session'), worktreeId: z.string().min(1) }),
  z.object({
    kind: z.literal('run'),
    worktreeId: z.string().min(1),
    experiment: z.string().min(1),
    run: z.string().min(1),
    title: z.string()
  })
])

export type PhoneNotifyTarget = z.infer<typeof PhoneNotifyTargetSchema>

/**
 * The decrypted push payload the service worker reads. It names a session or Run and its state,
 * never an agent's prompt or reply.
 */
export type PhoneNotifyPayload = {
  v: 1
  /** Dedupe key and notification tag: a repeat replaces the earlier notification. */
  id: string
  title: string
  body: string
  target?: PhoneNotifyTarget
}

export type PhoneNotifyVapidKeyResult =
  | { available: false }
  | { available: true; publicKey: string }

export type PhoneNotifySubscribeResult =
  | { subscribed: true }
  | {
      subscribed: false
      reason:
        | 'not_paired'
        | 'unavailable'
        | 'unsupported_endpoint'
        | 'invalid_keys'
        | 'stale_key'
        | 'storage_failed'
    }
