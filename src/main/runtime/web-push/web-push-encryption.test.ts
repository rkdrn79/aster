import { createECDH } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { encryptWebPushPayload } from './web-push-encryption'
import { createWebPushReceiver, decryptWebPushBody } from './web-push-receiver.test-fixture'

// RFC 8291 section 5 and Appendix A.
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  senderPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  senderPublic:
    'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  receiverPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  receiverPublic:
    'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  authSecret: 'BTBZMqHH6r4Tts7J_aSIgg',
  message:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml' +
    'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT' +
    'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN'
}

function bytes(base64url: string): Buffer {
  return Buffer.from(base64url, 'base64url')
}

function keysFromPrivate(privateKey: string): ReturnType<typeof createECDH> {
  const keys = createECDH('prime256v1')
  keys.setPrivateKey(bytes(privateKey))
  return keys
}

describe('encryptWebPushPayload', () => {
  it('reproduces the RFC 8291 example message byte for byte', () => {
    const sender = keysFromPrivate(RFC.senderPrivate)
    expect(sender.getPublicKey().toString('base64url')).toBe(RFC.senderPublic)
    const body = encryptWebPushPayload(
      Buffer.from(RFC.plaintext, 'utf8'),
      { p256dh: bytes(RFC.receiverPublic), auth: bytes(RFC.authSecret) },
      { senderKeys: sender, salt: bytes(RFC.salt) }
    )
    expect(body.toString('base64url')).toBe(RFC.message)
    expect(
      decryptWebPushBody(body, keysFromPrivate(RFC.receiverPrivate), bytes(RFC.authSecret))
    ).toEqual(Buffer.from(RFC.plaintext, 'utf8'))
  })

  it('uses a fresh sender key and salt for every message', () => {
    const receiver = createWebPushReceiver()
    const keys = { p256dh: bytes(receiver.keys.p256dh), auth: bytes(receiver.keys.auth) }
    const first = encryptWebPushPayload(Buffer.from('{"v":1}'), keys)
    const second = encryptWebPushPayload(Buffer.from('{"v":1}'), keys)
    expect(first.subarray(0, 86).equals(second.subarray(0, 86))).toBe(false)
    expect(receiver.decrypt(first)).toBe('{"v":1}')
    expect(receiver.decrypt(second)).toBe('{"v":1}')
  })

  it('refuses malformed subscription keys and messages over one record', () => {
    const receiver = createWebPushReceiver()
    const keys = { p256dh: bytes(receiver.keys.p256dh), auth: bytes(receiver.keys.auth) }
    expect(() =>
      encryptWebPushPayload(Buffer.from('x'), { ...keys, auth: keys.auth.subarray(1) })
    ).toThrow(/malformed/)
    expect(() => encryptWebPushPayload(Buffer.alloc(4096), keys)).toThrow(/one record/)
  })
})
