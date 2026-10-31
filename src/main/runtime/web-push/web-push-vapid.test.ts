import { createPublicKey, verify } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createVapidJwt,
  generateVapidJwk,
  vapidAuthorization,
  vapidKeysFromJwk
} from './web-push-vapid'

const NOW_MS = Date.UTC(2026, 9, 30, 2, 0, 0)

function decodeSegment(segment: string): unknown {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'))
}

describe('VAPID', () => {
  const jwk = generateVapidJwk()
  const keys = vapidKeysFromJwk(jwk)

  it('advertises the uncompressed P-256 point as applicationServerKey', () => {
    const publicKey = Buffer.from(keys?.publicKey ?? '', 'base64url')
    expect(publicKey).toHaveLength(65)
    expect(publicKey[0]).toBe(0x04)
    expect(vapidKeysFromJwk({ ...jwk, crv: 'P-384' })).toBeNull()
  })

  it('signs an ES256 JWT for the push service origin that the public key verifies', () => {
    if (!keys) {
      throw new Error('expected a key')
    }
    const jwt = createVapidJwt(keys, {
      audience: 'https://web.push.apple.com',
      subject: 'https://rkdrn79.github.io',
      nowMs: NOW_MS
    })
    const [header, claims, signature] = jwt.split('.')
    expect(decodeSegment(header)).toEqual({ typ: 'JWT', alg: 'ES256' })
    expect(decodeSegment(claims)).toEqual({
      aud: 'https://web.push.apple.com',
      exp: NOW_MS / 1000 + 12 * 60 * 60,
      sub: 'https://rkdrn79.github.io'
    })
    const publicKey = createPublicKey({
      key: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y },
      format: 'jwk'
    })
    const signatureBytes = Buffer.from(signature, 'base64url')
    expect(signatureBytes).toHaveLength(64)
    expect(
      verify(
        'sha256',
        Buffer.from(`${header}.${claims}`),
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        signatureBytes
      )
    ).toBe(true)
  })

  it('builds the Authorization header from the endpoint origin, not its path', () => {
    if (!keys) {
      throw new Error('expected a key')
    }
    const header = vapidAuthorization(
      keys,
      'https://web.push.apple.com/QGuQyavXutnMH8...',
      'https://rkdrn79.github.io',
      NOW_MS
    )
    const match = /^vapid t=([^,]+), k=(.+)$/.exec(header)
    expect(match?.[2]).toBe(keys.publicKey)
    const claims = decodeSegment(match?.[1].split('.')[1] ?? '')
    expect(claims).toMatchObject({ aud: 'https://web.push.apple.com' })
  })
})
