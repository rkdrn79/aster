const HIDDEN = '•••'

/**
 * An endpoint as it may be shown on screen: every query value (a relay URL's `key` is the secret
 * that opens it) and any password become dots, so a screenshot or a shoulder never carries them.
 */
export function maskEndpointSecrets(endpoint: string): string {
  return endpoint
    .replace(/(\/\/[^/?#@:\s]*):[^/?#@\s]*@/, `$1:${HIDDEN}@`)
    .replace(/([?&][^=&#\s]+=)[^&#\s]*/g, `$1${HIDDEN}`)
}
