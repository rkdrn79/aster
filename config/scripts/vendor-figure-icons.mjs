// Rebuilds src/research-harness/vendor/icons: the Figure kit's colour icons from Noto Emoji (pinned
// to the last commit whose images were Apache-2.0) and line icons from Lucide (ISC, the installed
// lucide-react). Run: node config/scripts/vendor-figure-icons.mjs
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { FIGURE_ICONS } from '../../src/research-harness/research-figures-icons.mjs'

// Why this commit: googlefonts/noto-emoji relicensed its root LICENSE to OFL on 2024-07-29; its
// parent, below, still ships the images under Apache-2.0.
const NOTO_COMMIT = '41e31b110b4eb929dffb410264694a06205b7ad7'
const root = path.resolve(import.meta.dirname, '../..')
const out = path.join(root, 'src/research-harness/vendor/icons')
const noto = path.join(out, 'noto')
const lucide = path.join(out, 'lucide')
mkdirSync(noto, { recursive: true })
mkdirSync(lucide, { recursive: true })

const fetchText = (url) => execFileSync('curl', ['-sSfL', url], { encoding: 'utf8' })
const base = `https://raw.githubusercontent.com/googlefonts/noto-emoji/${NOTO_COMMIT}`
writeFileSync(path.join(noto, 'LICENSE'), fetchText(`${base}/LICENSE`))

const attribute = (name, value) => `${name}="${String(value).replaceAll('"', '&quot;')}"`
for (const [name, [codepoints, line]] of Object.entries(FIGURE_ICONS)) {
  // Why: line-only icons (pipeline stages, teaser marks) have no emoji.
  if (codepoints) {
    const svg = fetchText(`${base}/svg/emoji_u${codepoints}.svg`)
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/>\s+</g, '><')
      .trim()
    writeFileSync(path.join(noto, `emoji_u${codepoints}.svg`), `${svg}\n`)
  }
  const module = await import(
    pathToFileURL(path.join(root, `node_modules/lucide-react/dist/esm/icons/${line}.js`)).href
  )
  const body = module.__iconNode
    .map(
      ([tag, attrs]) =>
        `<${tag} ${Object.entries(attrs)
          .filter(([key]) => key !== 'key')
          .map(([key, value]) => attribute(key, value))
          .join(' ')}/>`
    )
    .join('')
  writeFileSync(
    path.join(lucide, `${line}.svg`),
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>\n`
  )
  console.log(name)
}
copyFileSync(path.join(root, 'node_modules/lucide-react/LICENSE'), path.join(lucide, 'LICENSE'))
