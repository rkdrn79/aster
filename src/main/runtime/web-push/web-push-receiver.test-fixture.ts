import { createDecipheriv, createECDH, randomBytes, type ECDH } from 'node:crypto'
import { deriveWebPushContentKeys } from './web-push-encryption'

const GCM_TAG_LENGTH = 16

/** What a browser does with a push body: undo the aes128gcm coding with its own private key. */
export function decryptWebPushBody(body: Buffer, receiver: ECDH, authSecret: Buffer): Buffer {
  const salt = body.subarray(0, 16)
  const keyLength = body.readUInt8(20)
  const senderPublicKey = body.subarray(21, 21 + keyLength)
  const record = body.subarray(21 + keyLength)
  const { contentKey, nonce } = deriveWebPushContentKeys({
    ecdhSecret: receiver.computeSecret(senderPublicKey),
    receiverPublicKey: receiver.getPublicKey(),
    senderPublicKey,
    authSecret,
    salt
  })
  const decipher = createDecipheriv('aes-128-gcm', contentKey, nonce)
  decipher.setAuthTag(record.subarray(record.length - GCM_TAG_LENGTH))
  const padded = Buffer.concat([
    decipher.update(record.subarray(0, record.length - GCM_TAG_LENGTH)),
    decipher.final()
  ])
  let end = padded.length - 1
  while (end >= 0 && padded[end] === 0) {
    end -= 1
  }
  if (padded[end] !== 0x02) {
    throw new Error('Missing the last-record delimiter')
  }
  return padded.subarray(0, end)
}

/** A phone's push subscription keys, and the means to read what was pushed to it. */
export function createWebPushReceiver(): {
  keys: { p256dh: string; auth: string }
  decrypt: (body: Buffer) => string
} {
  const receiver = createECDH('prime256v1')
  receiver.generateKeys()
  const auth = randomBytes(16)
  return {
    keys: {
      p256dh: receiver.getPublicKey().toString('base64url'),
      auth: auth.toString('base64url')
    },
    decrypt: (body) => decryptWebPushBody(body, receiver, auth).toString('utf8')
  }
}
