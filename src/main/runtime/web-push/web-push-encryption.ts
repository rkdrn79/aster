// RFC 8291 message encryption with the RFC 8188 `aes128gcm` content coding, on Node crypto only.
import { createCipheriv, createECDH, hkdfSync, randomBytes, type ECDH } from 'node:crypto'

const RECORD_SIZE = 4096
const SALT_LENGTH = 16
const AUTH_SECRET_LENGTH = 16
const UNCOMPRESSED_P256_KEY_LENGTH = 65
const GCM_TAG_LENGTH = 16
// Why one record: a Web Push message is at most 4 KiB, so the last-record delimiter is the only one.
const LAST_RECORD_DELIMITER = 0x02

/** A subscription's keys as `PushSubscription.getKey()` returns them. */
export type WebPushReceiverKeys = {
  /** The user agent's uncompressed P-256 public key (65 bytes). */
  p256dh: Buffer
  /** The 16-byte authentication secret. */
  auth: Buffer
}

/** Fixed inputs that only a test vector supplies; each message otherwise gets fresh ones. */
export type WebPushEncryptionVector = {
  senderKeys: ECDH
  salt: Buffer
}

export function deriveWebPushContentKeys(input: {
  ecdhSecret: Buffer
  receiverPublicKey: Buffer
  senderPublicKey: Buffer
  authSecret: Buffer
  salt: Buffer
}): { contentKey: Buffer; nonce: Buffer } {
  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0', 'ascii'),
    input.receiverPublicKey,
    input.senderPublicKey
  ])
  const ikm = Buffer.from(hkdfSync('sha256', input.ecdhSecret, input.authSecret, keyInfo, 32))
  return {
    contentKey: Buffer.from(
      hkdfSync('sha256', ikm, input.salt, Buffer.from('Content-Encoding: aes128gcm\0', 'ascii'), 16)
    ),
    nonce: Buffer.from(
      hkdfSync('sha256', ikm, input.salt, Buffer.from('Content-Encoding: nonce\0', 'ascii'), 12)
    )
  }
}

export function webPushPlaintextFits(plaintext: Buffer): boolean {
  return plaintext.length + 1 + GCM_TAG_LENGTH <= RECORD_SIZE
}

/** The request body for one push: the aes128gcm header, then a single encrypted record. */
export function encryptWebPushPayload(
  plaintext: Buffer,
  receiver: WebPushReceiverKeys,
  vector?: WebPushEncryptionVector
): Buffer {
  if (
    receiver.p256dh.length !== UNCOMPRESSED_P256_KEY_LENGTH ||
    receiver.p256dh[0] !== 0x04 ||
    receiver.auth.length !== AUTH_SECRET_LENGTH
  ) {
    throw new Error('The push subscription keys are malformed.')
  }
  if (!webPushPlaintextFits(plaintext)) {
    throw new Error('The push message is larger than one record.')
  }
  const senderKeys = vector?.senderKeys ?? createECDH('prime256v1')
  if (!vector) {
    senderKeys.generateKeys()
  }
  const salt = vector?.salt ?? randomBytes(SALT_LENGTH)
  const senderPublicKey = senderKeys.getPublicKey()
  const { contentKey, nonce } = deriveWebPushContentKeys({
    ecdhSecret: senderKeys.computeSecret(receiver.p256dh),
    receiverPublicKey: receiver.p256dh,
    senderPublicKey,
    authSecret: receiver.auth,
    salt
  })
  const cipher = createCipheriv('aes-128-gcm', contentKey, nonce)
  const record = Buffer.concat([
    cipher.update(Buffer.concat([plaintext, Buffer.from([LAST_RECORD_DELIMITER])])),
    cipher.final(),
    cipher.getAuthTag()
  ])
  const header = Buffer.alloc(SALT_LENGTH + 5)
  salt.copy(header, 0)
  header.writeUInt32BE(RECORD_SIZE, SALT_LENGTH)
  header.writeUInt8(senderPublicKey.length, SALT_LENGTH + 4)
  return Buffer.concat([header, senderPublicKey, record])
}
