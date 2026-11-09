// Rebuilds src/research-harness/vendor/photos: CC0 photographs from Wikimedia Commons that the
// Figure kit uses as default thumbnails (a project's own images are preferred), each twice: a
// 320 px copy for small thumbnails and a large one in hd/ (up to 1600 px, under 250 KB) the kit
// embeds when a photo is drawn big or cropped close. Each photo's source, author and licence go
// to SOURCES.json. Needs macOS `sips` to shrink them.
// Run: node config/scripts/vendor-figure-photos.mjs
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const KINDS = {
  cat: 'domestic cat',
  dog: 'dog',
  bird: 'bird',
  street: 'street city',
  landscape: 'mountain landscape',
  beach: 'beach sea',
  kitchen: 'kitchen',
  robot: 'industrial robot',
  car: 'car',
  food: 'food',
  flower: 'flower',
  building: 'building facade'
}
const root = path.resolve(import.meta.dirname, '../..')
const out = path.join(root, 'src/research-harness/vendor/photos')
mkdirSync(path.join(out, 'hd'), { recursive: true })
const HD_BYTES = 250_000
const work = mkdtempSync(path.join(os.tmpdir(), 'aster-photos-'))
const agent = 'AsterFigureKit/1.0 (https://github.com/rkdrn79/aster)'
const strip = (html) =>
  String(html ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** The large copy: the biggest long side and quality (from 1600 px, q85) that fit HD_BYTES. */
function writeLarge(raw, file) {
  for (const side of ['1600', '1440', '1280', '1120', '1024']) {
    for (const quality of ['85', '82', '80']) {
      execFileSync(
        'sips',
        ['-s', 'format', 'jpeg', '-s', 'formatOptions', quality, '-Z', side, raw, '--out', file],
        { stdio: 'ignore' }
      )
      if (statSync(file).size <= HD_BYTES) {
        return
      }
    }
  }
}

const sources = {}
try {
  for (const [kind, query] of Object.entries(KINDS)) {
    const url = new URL('https://commons.wikimedia.org/w/api.php')
    const params = {
      action: 'query',
      format: 'json',
      generator: 'search',
      gsrnamespace: '6',
      gsrsearch: `${query} incategory:"CC-Zero" filetype:bitmap`,
      gsrlimit: '20',
      prop: 'imageinfo',
      iiprop: 'url|extmetadata|size',
      iiurlwidth: '480'
    }
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value)
    }
    const data = JSON.parse(
      execFileSync('curl', ['-sSfL', '-A', agent, url.href], { encoding: 'utf8' })
    )
    // Why landscape-shaped and CC0 only: thumbnails crop to wide frames, and CC0 needs no notice.
    const pick = Object.values(data.query?.pages ?? {})
      .toSorted((a, b) => a.index - b.index)
      .find((page) => {
        const info = page.imageinfo?.[0]
        return info?.extmetadata?.LicenseShortName?.value === 'CC0' && info.width > info.height
      })
    if (!pick) {
      console.log(`no CC0 photo for ${kind}`)
      continue
    }
    const info = pick.imageinfo[0]
    const raw = path.join(work, `${kind}.src`)
    execFileSync('curl', ['-sSfL', '-A', agent, '-o', raw, info.thumburl])
    const file = path.join(out, `${kind}.jpg`)
    execFileSync(
      'sips',
      ['-s', 'format', 'jpeg', '-s', 'formatOptions', '72', '-Z', '320', raw, '--out', file],
      { stdio: 'ignore' }
    )
    // Why the same file: crops are fractions of the photo, so both copies must show one frame.
    const original = path.join(work, `${kind}.large`)
    const name = encodeURIComponent(pick.title.replace(/^File:/, '').replaceAll(' ', '_'))
    const large = `https://commons.wikimedia.org/wiki/Special:FilePath/${name}?width=1600`
    execFileSync('curl', ['-sSfL', '-A', agent, '-o', original, large])
    writeLarge(original, path.join(out, 'hd', `${kind}.jpg`))
    sources[kind] = {
      file: `${kind}.jpg`,
      title: pick.title,
      page: info.descriptionurl,
      author: strip(info.extmetadata?.Artist?.value),
      licence: 'CC0 1.0 (public domain dedication)',
      hd: `hd/${kind}.jpg`
    }
    console.log(kind, pick.title)
  }
  writeFileSync(path.join(out, 'SOURCES.json'), `${JSON.stringify(sources, null, 2)}\n`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
