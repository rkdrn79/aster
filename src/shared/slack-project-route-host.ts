import { createHash } from 'node:crypto'
import { resolveEnvironment } from './runtime-environment-store'
import { getPreferredPairingOffer } from './runtime-environments'

export function slackHostKeyFingerprint(publicKeyB64: string): string {
  return createHash('sha256').update(Buffer.from(publicKeyB64, 'base64')).digest('hex')
}

/** Revalidate the host binding before every remote delivery; a re-pair needs an explicit rebind. */
export function assertSlackRouteHost(
  userDataPath: string,
  route: {
    environmentId?: string
    executionHostId?: string
    hostKeyFingerprint?: string
    runtimeId?: string
  }
): string | null {
  if (!route.environmentId) {
    if (route.executionHostId && route.executionHostId !== 'local') {
      throw new Error('Remote Slack route has no paired runtime')
    }
    return null
  }
  if (!route.hostKeyFingerprint || !route.runtimeId) {
    throw new Error('Remote Slack route is missing its verified host identity')
  }
  const environment = resolveEnvironment(userDataPath, route.environmentId)
  const fingerprint = slackHostKeyFingerprint(getPreferredPairingOffer(environment).publicKeyB64)
  if (fingerprint !== route.hostKeyFingerprint || environment.runtimeId !== route.runtimeId) {
    throw new Error('Remote Slack host identity changed; reconnect this project in Aster')
  }
  return environment.id
}
