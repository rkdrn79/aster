// Pixel size of a PNG or JPEG from its bytes, without decoding it.

export function imageSize(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length > 24 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { width: view.getUint32(16), height: view.getUint32(20) }
  }
  for (let index = 2; index + 9 < bytes.length;) {
    if (bytes[index] !== 0xff) {
      break
    }
    const marker = bytes[index + 1]
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { width: view.getUint16(index + 7), height: view.getUint16(index + 5) }
    }
    index += 2 + view.getUint16(index + 2)
  }
  return null
}

export function imageMimeType(name) {
  const lower = String(name).toLowerCase()
  return lower.endsWith('.jpg') || lower.endsWith('.jpeg')
    ? 'image/jpeg'
    : lower.endsWith('.webp')
      ? 'image/webp'
      : 'image/png'
}
