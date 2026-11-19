import assert from 'node:assert/strict'
import test from 'node:test'
import { figureStyle } from './research-figures-style.mjs'
import { hexToOklch } from './research-figures-palette.mjs'
import {
  ILLUSTRATION_STYLES,
  TONES,
  illustrationLook,
  illustrationPalette,
  outlineHex,
  paintHex,
  paintIllustrationSvg,
  shadedTone,
  svgColors
} from './research-figures-illustration-paint.mjs'
import {
  circlePoints,
  drawingList,
  illustrationSvg,
  litDiscPoints,
  pathOf,
  roundRectPoints
} from './research-figures-illustration-svg.mjs'
import { isoBuilder, VIEWS } from './research-figures-illustration-iso.mjs'
import {
  ILLUSTRATION_OBJECTS,
  drawObject,
  illustrationIndexText,
  searchIllustrations
} from './research-figures-illustration-catalog.mjs'

const graphite = figureStyle('graphite', 'blue')
const lightness = (hex) => hexToOklch(hex).L
const fills = (svg) => [...svg.matchAll(/data-r="([a-z]+)"[^>]*?fill="(#[0-9a-f]{6})"/g)]

test('every role has a ramp of twelve tones, light to dark', () => {
  const palette = illustrationPalette(graphite)
  for (const ramp of Object.values(palette.ramps)) {
    assert.equal(ramp.length, TONES)
    for (let tone = 1; tone < TONES; tone += 1) {
      assert.ok(lightness(ramp[tone]) < lightness(ramp[tone - 1]))
    }
  }
})

test('the accent ramp follows the figure accent and roles repaint', () => {
  const blue = illustrationPalette(figureStyle('graphite', 'blue'))
  const teal = illustrationPalette(figureStyle('graphite', 'teal'))
  assert.notEqual(blue.ramps.accent[4], teal.ramps.accent[4])
  const hue = hexToOklch(blue.ramps.accent[6]).h
  assert.ok(Math.abs(hue - hexToOklch(graphite.accents[0].solid).h) < 12)
  const swapped = illustrationPalette(graphite, { roles: { accent: 'second' } })
  assert.deepEqual(swapped.ramps.accent, blue.ramps.second)
  const hexed = illustrationPalette(graphite, { roles: { accent: '#d95f02' } })
  assert.ok(Math.abs(hexToOklch(hexed.ramps.accent[7]).h - hexToOklch('#d95f02').h) < 15)
  assert.equal(illustrationPalette(graphite, { roles: { nope: 'second' } }).ramps.nope, undefined)
  const deep = illustrationPalette(graphite, { skin: 'deep' })
  assert.ok(lightness(deep.ramps.skin[2]) < lightness(blue.ramps.skin[2]))
})

test('the second hue sits apart from the accent, and neutrals follow tinted presets', () => {
  const palette = illustrationPalette(graphite)
  assert.ok(Math.abs(hexToOklch(palette.ramps.second[6]).h - 70) < 15)
  const warm = illustrationPalette(figureStyle('graphite', 'amber'))
  assert.ok(Math.abs(hexToOklch(warm.ramps.second[6]).h - 245) < 15)
  assert.ok(hexToOklch(palette.ramps.neutral[4]).C < 0.01)
})

test('shading takes one or two steps by the look', () => {
  assert.equal(shadedTone(2, 0, 'three-tone'), 2)
  assert.equal(shadedTone(2, 1, 'three-tone'), 3)
  assert.equal(shadedTone(2, 2, 'three-tone'), 5)
  assert.equal(shadedTone(2, 2, 'two-tone'), 3)
  assert.equal(shadedTone(2, 1, 'one-face'), 2)
  assert.equal(shadedTone(2, 2, 'one-face'), 3)
  assert.equal(shadedTone(2, 2, 'flat'), 2)
  assert.equal(shadedTone(11, 2, 'three-tone'), 11)
})

test('paints and outlines resolve by the look', () => {
  const palette = illustrationPalette(graphite)
  const flat = ILLUSTRATION_STYLES.flat
  assert.equal(paintHex(palette, 'none'), 'none')
  assert.equal(paintHex(palette, 'white'), '#ffffff')
  assert.equal(paintHex(palette, 'ink'), palette.ink)
  assert.equal(paintHex(palette, 'accent', 2, 1, flat), palette.ramps.accent[3])
  assert.equal(paintHex(palette, 'accent', 2, 0, ILLUSTRATION_STYLES.line), palette.ramps.accent[1])
  assert.equal(paintHex(palette, 'accent', 2, 0, ILLUSTRATION_STYLES.mono), '#ffffff')
  assert.equal(outlineHex(palette, 'accent', 2, flat), 'none')
  assert.equal(outlineHex(palette, 'accent', 2, ILLUSTRATION_STYLES.line), palette.ink)
  assert.equal(outlineHex(palette, 'accent', 2, ILLUSTRATION_STYLES.tonal), palette.ramps.accent[7])
})

test('outlines are sampled as closed paths', () => {
  assert.equal(roundRectPoints(0, 0, 10, 10, 0).length, 4)
  assert.equal(roundRectPoints(0, 0, 10, 10, 2, 6).length, 28)
  assert.equal(circlePoints(0, 0, 5, { segments: 12 }).length, 12)
  assert.equal(circlePoints(0, 0, 5, { from: 0, to: 180, segments: 12 }).length, 7)
  assert.match(
    pathOf([
      [0, 0],
      [1, 1],
      [2, 0]
    ]),
    /^M0 0L1 1L2 0Z$/
  )
  const lit = litDiscPoints(0, 0, 10, [-1, -1])
  assert.ok(lit.every(([x, y]) => Math.hypot(x, y) <= 10.001))
})

test('a drawing list writes a role-tagged SVG sized for print', () => {
  const list = drawingList()
  const triangle = [
    [0, 0],
    [100, 0],
    [100, 50]
  ]
  // Why destructured: the lint reads list.fill(…) as Array#fill.
  const { fill } = list
  fill(triangle, { role: 'accent', tone: 2, shade: 1 })
  list.stroke(
    [
      [0, 60],
      [100, 60]
    ],
    { role: 'neutral', tone: 6, weight: 1, dash: true }
  )
  list.edge(
    [
      [0, 0],
      [0, 50]
    ],
    { role: 'accent', tone: 3 }
  )
  const svg = illustrationSvg(list, { look: 'line', style: graphite, width: 144, pad: 0 })
  assert.match(svg, /data-aster-illustration="1"/)
  assert.match(svg, /data-look="line"/)
  // 102 viewBox units (the line's width pads it) placed 144 wide: one pt is 2 scene units,
  // so 1.42 viewBox units per pt, and the 0.6 pt line look strokes 0.85.
  assert.match(svg, /data-ppt="1.42"/)
  assert.match(svg, /stroke-width="0.85"/)
  assert.match(svg, /stroke-dasharray/)
  assert.throws(() => illustrationSvg(drawingList(), { style: graphite }), /at least one shape/)
})

test('repainting swaps colours by role and look and leaves untagged shapes', () => {
  const list = drawingList()
  const triangle = [
    [0, 0],
    [10, 0],
    [10, 10]
  ]
  const { fill } = list
  fill(triangle, { role: 'accent', tone: 2 })
  const svg = illustrationSvg(list, { style: graphite, width: 100 }).replace(
    '</g>',
    '<path d="M0 0L1 1" fill="#123456"/></g>'
  )
  const teal = paintIllustrationSvg(svg, illustrationPalette(figureStyle('graphite', 'teal')))
  assert.notEqual(fills(svg)[0][2], fills(teal)[0][2])
  assert.match(teal, /fill="#123456"/)
  const mono = paintIllustrationSvg(svg, illustrationPalette(graphite), { look: 'mono' })
  assert.equal(illustrationLook(mono).name, 'mono')
  assert.equal(fills(mono)[0][2], '#ffffff')
  assert.ok(svgColors(teal).includes('#123456'))
})

test('a box shows three faces, lit top lightest, the shade side darkest', () => {
  const b = isoBuilder()
  const faces = b.box({ at: [0, 0, 0], size: [10, 10, 10], role: 'neutral', tone: 2 })
  const fillsOnly = b.list.items.filter((item) => item.kind === 'fill')
  assert.equal(fillsOnly.length, 3)
  assert.deepEqual(fillsOnly.map((item) => item.shade).toSorted(), [0, 1, 2])
  assert.equal(fillsOnly.at(-1).shade, 0)
  for (const face of ['top', 'left', 'right']) {
    assert.equal(typeof faces[face].rect, 'function')
  }
  const right = isoBuilder({ light: 'right' })
  right.box({ at: [0, 0, 0], size: [10, 10, 10] })
  const [first] = right.list.items
  const [firstLeft] = b.list.items
  assert.notEqual(first.shade, firstLeft.shade)
})

test('cylinders lie along any axis and show their cap', () => {
  for (const axis of ['z', 'x', 'y', [1, 1, 0]]) {
    const b = isoBuilder()
    const cylinder = b.cylinder({ at: [0, 0, 0], r: 4, h: 10, axis })
    assert.ok(b.list.items.filter((item) => item.kind === 'fill').length >= 2)
    assert.equal(typeof cylinder.top.circle, 'function')
  }
})

test('placing an object moves, scales, mirrors and renames its roles', () => {
  const b = isoBuilder()
  b.place({ at: [100, 0, 0], scale: 2, roles: { accent: 'second' } }, (inner) =>
    inner.box({ at: [0, 0, 0], size: [5, 5, 5], role: 'accent' })
  )
  assert.ok(b.list.items.every((item) => item.role === 'second'))
  assert.ok(b.bounds().x > 50)
  const flat = isoBuilder()
  const corner = [
    [0, 0],
    [1, 0],
    [0, 1]
  ]
  flat.place({ at: [100, 0, 0], scale: 2 }, (inner) => {
    const { fill } = inner.flat
    fill(corner)
  })
  assert.ok(flat.bounds().x > 50)
  assert.ok(b.depth([10, 10, 10]) > b.depth([0, 0, 0]))
})

test('paths, tubes, spheres, prisms and blocks draw', () => {
  const b = isoBuilder({ view: 'oblique' })
  b.path(
    [
      [0, 0, 0],
      [20, 0, 0]
    ],
    { dash: true }
  )
  b.tube({ from: [0, 0, 0], to: [0, 0, 20], r: 2 })
  b.sphere({ at: [0, 0, 0], r: 3 })
  b.prism({
    at: [0, 0, 0],
    profile: [
      [0, 0],
      [4, 0],
      [2, 3]
    ],
    length: 6
  })
  const block = b.block({ origin: [0, 0, 0], u: [4, 0, 0], v: [0, 0, -4], w: [0, 1, 0] })
  block.face.rect(0, 0, 2, 2)
  b.shadow({ at: [0, 0], size: [4, 4] })
  b.roundShadow({ at: [0, 0], r: 3 })
  assert.ok(b.list.items.length > 12)
  assert.ok(Object.keys(VIEWS).includes('oblique'))
})

test('the catalogue has the key research objects, each tagged and drawable in every look', () => {
  const required = [
    'gpu-server',
    'dataset-stack',
    'document',
    'database',
    'camera',
    'robot-arm',
    'car',
    'phone',
    'chat-window',
    'microscope',
    'cell',
    'molecule',
    'chip',
    'cloud',
    'laptop',
    'person-at-desk',
    'globe',
    'book',
    'chart-board'
  ]
  for (const name of required) {
    assert.ok(ILLUSTRATION_OBJECTS[name], name)
  }
  for (const [name, entry] of Object.entries(ILLUSTRATION_OBJECTS)) {
    assert.ok(entry.title && entry.tags.length && entry.roles, name)
    const builder = drawObject(name)
    for (const look of Object.keys(ILLUSTRATION_STYLES)) {
      const svg = builder.svg({ look, style: graphite, width: 144 })
      assert.doesNotMatch(svg, /NaN|undefined/, `${name} ${look}`)
    }
  }
  assert.throws(() => drawObject('unicorn'), /No illustration object/)
})

test('search finds objects by name, tag and title', () => {
  assert.equal(searchIllustrations('robot arm')[0].name, 'robot-arm')
  assert.equal(searchIllustrations('gpu server')[0].name, 'gpu-server')
  assert.equal(searchIllustrations('microscope')[0].name, 'microscope')
  assert.equal(searchIllustrations('zebra crossing').length, 0)
  assert.match(illustrationIndexText('robot arm'), /robot-arm/)
  assert.match(illustrationIndexText('zebra'), /draw the object yourself/)
  const assets = [
    {
      name: 'cat-flat',
      set: 'fluent',
      title: 'Cat',
      tags: ['cat'],
      roles: {},
      licence: 'MIT',
      source: 'x',
      style: 'flat'
    }
  ]
  assert.equal(searchIllustrations('cat', assets)[0].name, 'cat-flat')
  assert.match(illustrationIndexText(null, assets), /MIT/)
})
