// RFC 8292 VAPID: the host's P-256 key, and the ES256 JWT that names it to a push service.
import {
  createPrivateKey,
  generateKeyPairSync,
  sign,
  type JsonWebKey,
  type KeyObject
} from 'node:crypto'

// Why 12 h: RFC 8292 caps `exp` at 24 h, and Apple refuses tokens that reach past a day.
const VAPID_TOKEN_LIFETIME_SECONDS = 12 * 60 * 60

export type VapidKeys = {
  privateKey: KeyObject
  /** The uncompressed P-256 public key, base64url, as `applicationServerKey` takes it. */
  publicKey: string
}

function base64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

/** Null unless `jwk` is a P-256 private key with both coordinates. */
export function vapidKeysFromJwk(jwk: JsonWebKey): VapidKeys | null {
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.d || !jwk.x || !jwk.y) {
    return null
  }
  const x = Buffer.from(jwk.x, 'base64url')
  const y = Buffer.from(jwk.y, 'base64url')
  if (x.length !== 32 || y.length !== 32) {
    return null
  }
  return {
    privateKey: createPrivateKey({ key: jwk, format: 'jwk' }),
    publicKey: Buffer.concat([Buffer.from([0x04]), x, y]).toString('base64url')
  }
}

export function generateVapidJwk(): JsonWebKey {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  return privateKey.export({ format: 'jwk' })
}

/** The ES256 JWT for one push service origin. */
export function createVapidJwt(
  keys: VapidKeys,
  claims: { audience: string; subject: string; nowMs: number }
): string {
  const signingInput = `${base64urlJson({ typ: 'JWT', alg: 'ES256' })}.${base64urlJson({
    aud: claims.audience,
    exp: Math.floor(claims.nowMs / 1000) + VAPID_TOKEN_LIFETIME_SECONDS,
    sub: claims.subject
  })}`
  const signature = sign('sha256', Buffer.from(signingInput, 'ascii'), {
    key: keys.privateKey,
    dsaEncoding: 'ieee-p1363'
  })
  return `${signingInput}.${signature.toString('base64url')}`
}

/** The `Authorization` header value for a push to `endpoint`. */
export function vapidAuthorization(
  keys: VapidKeys,
  endpoint: string,
  subject: string,
  nowMs: number
): string {
  const jwt = createVapidJwt(keys, { audience: new URL(endpoint).origin, subject, nowMs })
  return `vapid t=${jwt}, k=${keys.publicKey}`
}
