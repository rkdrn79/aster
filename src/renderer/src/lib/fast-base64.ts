// Why: `Uint8Array.from(atob(s), fn)` calls a JS function per byte (about 25 MB/s), which froze the
// renderer for seconds on a large PDF. Chromium ships native base64 on Uint8Array; an engine
// without it (an older phone browser) takes a plain loop, still ~20x faster than the callback.

export function decodeBase64Bytes(value: string): Uint8Array<ArrayBuffer> {
  if (typeof Uint8Array.fromBase64 === 'function') {
    return Uint8Array.fromBase64(value)
  }
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export function encodeBase64Bytes(bytes: Uint8Array): string {
  if (typeof bytes.toBase64 === 'function') {
    return bytes.toBase64()
  }
  const parts: string[] = []
  // A multiple of 3, so every part but the last encodes without padding.
  const stride = 24 * 1024
  for (let offset = 0; offset < bytes.length; offset += stride) {
    parts.push(btoa(String.fromCharCode(...bytes.subarray(offset, offset + stride))))
  }
  return parts.join('')
}
