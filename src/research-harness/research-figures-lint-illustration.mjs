// Lint for illustrations: one house look, projection and light per figure, strokes that print,
// few meaningful hues, and the clichés judges read as generated (a robot for "the model", a
// brain for reasoning, sparkles, glow).
import { WORLD_PRESETS } from './research-figures-palette-worlds.mjs'

/** Printed stroke below this (pt) vanishes or breaks up in print. */
export const MIN_STROKE_PT = 0.25
/** Hues an illustration may add with a meaning (ours, the other actor); materials do not count. */
export const MAX_ILLUSTRATION_HUES = 2
/** In a world, the objects may take its four role hues (ours, outputs, machinery, given). */
const MAX_WORLD_HUES = 4
const MEANINGFUL_ROLES = new Set(['accent', 'second', 'third', 'fourth', 'good', 'bad'])
/** Objects drawn flat by nature (symbols), allowed beside isometric ones. */
const SYMBOLS = new Set(['cell', 'dna', 'cloud', 'mouse', 'molecule'])
const SPARKLES = /[✨✦✧⭐🌟💫]|\bsparkles?\b/iu
const ROBOT_ICONS = new Set(['robot'])
const PHYSICAL_ROBOTICS =
  /\b(robot(ic)?s?|arm|gripper|manipulat\w*|embodied|grasp\w*|navigat\w*|locomotion|drone|vehicle|driving)\b/i
const LANGUAGE_MODEL = /\b(LLMs?|language models?|chat ?bots?|assistants?|GPT|AI)\b/

function svgText(file) {
  const [head, body] = String(file?.dataURL ?? '').split(',', 2)
  if (!body || !head.startsWith('data:image/svg+xml')) {
    return null
  }
  if (!head.endsWith(';base64')) {
    return decodeURIComponent(body)
  }
  // Why atob: the app runs this lint too, where there is no Buffer.
  return new TextDecoder().decode(Uint8Array.from(atob(body), (char) => char.charCodeAt(0)))
}

/** The thinnest painted stroke of an SVG placed `width` units wide, in printed pt. */
export function thinnestStrokePt(svg, width, scale = 1) {
  const box = /viewBox="([-\d.\s]+)"/.exec(svg)?.[1]?.trim().split(/\s+/).map(Number)
  if (!box || !(box[2] > 0)) {
    return null
  }
  const unitsPerViewBox = width / box[2]
  let thinnest = Infinity
  for (const match of svg.matchAll(
    /<(?:path|circle|ellipse|rect|polygon|polyline|line)\b([^>]*)>/g
  )) {
    const attrs = match[1]
    const stroke = /\sstroke="([^"]*)"/.exec(attrs)?.[1]
    const fill = /\sfill="([^"]*)"/.exec(attrs)?.[1]
    const strokeWidth = Number(/\sstroke-width="([\d.]+)"/.exec(attrs)?.[1] ?? 1)
    // Why skip seams: a hairline in a face's own colour only hides the gap between faces.
    if (!stroke || stroke === 'none' || stroke === fill || !(strokeWidth > 0)) {
      continue
    }
    thinnest = Math.min(thinnest, strokeWidth)
  }
  return Number.isFinite(thinnest) ? (thinnest * unitsPerViewBox * scale) / 2 : null
}

/** The meaningful colour roles an illustration paints with, after its role overrides. */
export function meaningfulRoles(svg, roles = {}) {
  const used = new Set([...svg.matchAll(/\sdata-(?:r|sr|e)="([a-z]+)"/g)].map((match) => match[1]))
  const found = new Set()
  for (const role of used) {
    const target = roles?.[role] ?? role
    if (MEANINGFUL_ROLES.has(target) || /^#[0-9a-f]{3,6}$/i.test(target)) {
      found.add(target)
    }
  }
  return found
}

const round = (value) => Math.round(value * 100) / 100

/**
 * Adds the illustration findings for `elements` (the scene's live elements) whose SVGs are in
 * `files`; `scale` is the page's print scale.
 */
export function illustrationChecks(elements, files, add, scale = 1, page = null) {
  const pictures = elements.filter(
    (element) => element.type === 'image' && element.customData?.asterIllustration
  )
  // Why apart: perspective scenes are drawn by their own engine in their own default look;
  // they must agree with each other, and assets with each other.
  const isScene = (element) => element.customData.asterIllustration.source === 'perspective'
  for (const [key, group] of ['look', 'light'].flatMap((name) => [
    [name, pictures.filter(isScene)],
    [name, pictures.filter((element) => !isScene(element))]
  ])) {
    const values = [...new Set(group.map((element) => element.customData.asterIllustration[key]))]
    if (values.length > 1) {
      const [first, ...rest] = values
      for (const value of rest) {
        const element = group.find((entry) => entry.customData.asterIllustration[key] === value)
        add(
          'warning',
          `illustration-${key === 'look' ? 'style' : 'light'}`,
          element,
          `is drawn with ${key} "${value}" but ${group.find((entry) => entry.customData.asterIllustration[key] === first).id} uses "${first}"; one ${key === 'look' ? 'house look' : 'light direction'} per figure, or mixed sources read as clip art (fig.illustrationStyle)`
        )
      }
    }
  }
  const projected = pictures.filter((element) => {
    const record = element.customData.asterIllustration
    return !(record.projection === 'front' && SYMBOLS.has(record.name))
  })
  const projections = [
    ...new Set(projected.map((element) => element.customData.asterIllustration.projection))
  ]
  if (projections.length > 1) {
    const [first, ...rest] = projections
    for (const value of rest) {
      const element = projected.find(
        (item) => item.customData.asterIllustration.projection === value
      )
      add(
        'warning',
        'illustration-projection',
        element,
        `is drawn ${value} beside ${first} illustrations; keep one projection per panel (draw it with the builder, or pick an object in the same view)`
      )
    }
  }
  const hues = new Map()
  for (const element of pictures) {
    const svg = svgText(files?.[element.fileId])
    if (!svg) {
      continue
    }
    const thinnest = thinnestStrokePt(svg, element.width, scale)
    if (thinnest !== null && thinnest < MIN_STROKE_PT - 1e-6) {
      add(
        'warning',
        'illustration-thin-stroke',
        element,
        `has lines ${round(thinnest)} pt wide at print, under ${MIN_STROKE_PT} pt: they break up in print; place it larger or redraw it with fewer, heavier lines`
      )
    }
    if (/<filter\b|feGaussianBlur|<radialGradient\b/.test(svg)) {
      add(
        'warning',
        'illustration-glow',
        element,
        'uses a glow, blur or radial gradient; flat tones read as drawn, glow reads as generated'
      )
    }
    for (const role of meaningfulRoles(svg, element.customData.asterIllustration.roles)) {
      hues.set(role, hues.get(role) ?? element)
    }
  }
  const world = Boolean(WORLD_PRESETS[page?.style])
  const most = world ? MAX_WORLD_HUES : MAX_ILLUSTRATION_HUES
  if (hues.size > most) {
    const extra = [...hues.entries()][most]
    add(
      'warning',
      'illustration-hues',
      extra[1],
      world
        ? `the illustrations paint ${hues.size} meaningful hues (${[...hues.keys()].join(', ')}); keep the world's ${most} role hues and turn the rest neutral with roles: { accent: 'neutral' }`
        : `the illustrations paint ${hues.size} meaningful hues (${[...hues.keys()].join(', ')}); keep ${most} (ours in the accent, one other actor in second) and turn the rest neutral with roles: { accent: 'neutral' }`
    )
  }
  clicheChecks(elements, pictures, add)
}

function clicheChecks(elements, pictures, add) {
  const words = elements
    .filter((element) => element.type === 'text')
    .map((element) => element.text ?? '')
    .join(' ')
  for (const element of elements) {
    const icon = element.customData?.asterIcon
    if (element.type === 'text' && SPARKLES.test(element.text ?? '')) {
      add(
        'warning',
        'illustration-cliche',
        element,
        'uses sparkles; they read as an AI tell; name what changes instead'
      )
    }
    if (icon === 'brain' || icon === 'bulb') {
      add(
        'warning',
        'illustration-cliche',
        element,
        `draws a ${icon === 'brain' ? 'brain for reasoning' : 'light bulb for an idea'}, a cliché; draw what the model reads or writes instead`
      )
    }
    if (ROBOT_ICONS.has(icon) && LANGUAGE_MODEL.test(words) && !PHYSICAL_ROBOTICS.test(words)) {
      add(
        'warning',
        'illustration-cliche',
        element,
        'draws a robot for a language model; draw the model as a block or a chat window, and a robot only when the paper has one'
      )
    }
  }
  for (const element of pictures) {
    const name = element.customData.asterIllustration.name ?? ''
    if (/robot/.test(name) && LANGUAGE_MODEL.test(words) && !PHYSICAL_ROBOTICS.test(words)) {
      add(
        'warning',
        'illustration-cliche',
        element,
        'draws a robot in a figure about a language model; a robot only when the paper has one'
      )
    }
  }
}
