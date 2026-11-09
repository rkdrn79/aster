import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import test from 'node:test'
import { imageSize } from './research-figures-image.mjs'
import { figureFileStore, photoPixelsNeeded } from './research-figures-kit-files.mjs'
import { PHOTO_KINDS } from './research-figures-photos.mjs'

const vendored = (name) => new URL(`vendor/photos/${name}`, import.meta.url)

test('every stock photo has a large copy of the same frame, small enough to ship', () => {
  const sources = JSON.parse(readFileSync(vendored('SOURCES.json'), 'utf8'))
  let total = 0
  for (const kind of PHOTO_KINDS) {
    const small = imageSize(readFileSync(vendored(`${kind}.jpg`)))
    const large = imageSize(readFileSync(vendored(`hd/${kind}.jpg`)))
    const bytes = statSync(vendored(`hd/${kind}.jpg`)).size
    total += bytes + statSync(vendored(`${kind}.jpg`)).size
    assert.equal(sources[kind].hd, `hd/${kind}.jpg`)
    assert.ok(Math.max(large.width, large.height) >= 1024, `${kind} is large`)
    assert.ok(bytes <= 250_000, `${kind}: ${bytes} bytes`)
    const ratio = large.width / large.height / (small.width / small.height)
    assert.ok(Math.abs(ratio - 1) < 0.01, `${kind}: the same frame (${ratio})`)
  }
  assert.ok(total <= 3_000_000, `${total} bytes in all`)
})

test('a photo embeds the small copy unless it must print at 300 dpi with more pixels', () => {
  assert.equal(photoPixelsNeeded(144, 1), 300, 'an inch-wide photo needs 300 px')
  assert.equal(photoPixelsNeeded(72, 0.25), 600, 'a quarter of it at half an inch: 600 px')
  const scene = { files: {} }
  const files = figureFileStore(scene, '/tmp')
  const thumb = files.photo('cat', photoPixelsNeeded(58, 1))
  assert.equal(thumb.fileId, 'aster-photo-cat')
  assert.equal(thumb.size.width, 320)
  const big = files.photo('cat', photoPixelsNeeded(173, 1))
  assert.equal(big.fileId, 'aster-photo-cat-hd')
  assert.equal(big.size.width, 1600)
  assert.deepEqual(Object.keys(scene.files).toSorted(), ['aster-photo-cat', 'aster-photo-cat-hd'])
  assert.ok(
    scene.files['aster-photo-cat-hd'].dataURL.length >
      4 * scene.files['aster-photo-cat'].dataURL.length
  )
  files.prune([{ type: 'image', fileId: 'aster-photo-cat-hd' }])
  assert.deepEqual(Object.keys(scene.files), ['aster-photo-cat-hd'], 'the unused copy goes')
})
