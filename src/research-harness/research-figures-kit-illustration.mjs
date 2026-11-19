// Illustrations in a figure: a drawn object, a bundled asset, an agent-drawn object or a small
// scene, placed as one SVG image that stays vector in the exports and repaints by colour role.
// One house look, projection and light per figure, kept on the page; labels stay native text,
// joined by right-angle leaders that end in a dot.
import { figureElement, PAGE_FRAME_ID } from './research-figures-model.mjs'
import { isoBuilder, VIEWS } from './research-figures-illustration-iso.mjs'
import {
  ILLUSTRATION_OBJECTS,
  objectProjection,
  searchIllustrations
} from './research-figures-illustration-catalog.mjs'
import {
  ILLUSTRATION_STYLES,
  SKIN_TONES,
  illustrationPalette,
  paintIllustrationSvg
} from './research-figures-illustration-paint.mjs'
import { assetSvg, bundledAssets } from './research-figures-illustration-assets.mjs'
import { makeText } from './research-figures-draw.mjs'
import { hasInlineMath, labelLines, makeLines, needsTex } from './research-figures-type.mjs'
import { elementBounds } from './research-figures-geometry.mjs'
import { makeDot, makePolyline } from './research-figures-shapes.mjs'
import { warnKit } from './research-figures-cards.mjs'
import { oneOf } from './research-figures-options.mjs'

/** The look a figure's illustrations take when nobody chose one, by colour preset. */
const PRESET_LOOK = { outline: 'line', 'print-mono': 'mono' }
const LIGHT_NAMES = ['left', 'right']
/** Size an illustration takes when the call gives neither `w` nor `h`: an inch tall. */
const DEFAULT_HEIGHT = 144

const r2 = (value) => Math.round(value * 100) / 100

/** The viewBox of an SVG as numbers. */
function viewBoxOf(svg) {
  const match = /viewBox="([-\d.\s]+)"/.exec(svg)
  const [vx, vy, vw, vh] = (match?.[1] ?? '0 0 100 100').trim().split(/\s+/).map(Number)
  return { vx, vy, vw, vh }
}

/** Sets the printed stroke scale (`data-ppt`) of a role-tagged SVG placed `width` units wide. */
function withScale(svg, width) {
  const { vw } = viewBoxOf(svg)
  const perPt = r2((2 * vw) / width)
  return /\sdata-ppt="/.test(svg)
    ? svg.replace(/\sdata-ppt="[^"]*"/, ` data-ppt="${perPt}"`)
    : svg.replace(/<svg\b/, `<svg data-ppt="${perPt}"`)
}

export function illustrationMethods(core) {
  const { styled } = core
  const warn = (message) => (core.warn ?? warnKit)([message])
  const styleNow = () => styled({}).style
  const pageFrame = () => core.elements.find((element) => element.id === PAGE_FRAME_ID)
  /** The figure's illustration settings: what the page records, else the preset's look. */
  const settings = () => {
    const recorded = pageFrame()?.customData?.asterPage?.illustration ?? {}
    return {
      look: recorded.look ?? PRESET_LOOK[styleNow().name] ?? 'flat',
      view: recorded.view ?? 'iso',
      light: recorded.light ?? 'left',
      skin: recorded.skin ?? 'light',
      recorded
    }
  }
  const record = (next) => {
    const page = pageFrame()
    if (!page) {
      return
    }
    const current = page.customData?.asterPage ?? {}
    page.customData = {
      ...page.customData,
      asterPage: { ...current, illustration: { ...current.illustration, ...next } }
    }
  }
  const choose = (spec) => {
    const figure = settings()
    const look = oneOf('style', spec.style ?? spec.look, Object.keys(ILLUSTRATION_STYLES))
    const view = oneOf('view', spec.view, Object.keys(VIEWS))
    const light = oneOf('light', spec.light, LIGHT_NAMES)
    const skin = oneOf('skin', spec.skin, Object.keys(SKIN_TONES))
    const chosen = {
      look: look ?? figure.look,
      view: view ?? figure.view,
      light: light ?? figure.light,
      skin: skin ?? figure.skin
    }
    for (const key of ['look', 'view', 'light']) {
      if (figure.recorded[key] && chosen[key] !== figure.recorded[key]) {
        warn(
          `${spec.id} asks for ${key} "${chosen[key]}" but this figure's illustrations use "${figure.recorded[key]}"; keep one ${key} per figure (fig.illustrationStyle) or say why`
        )
      }
    }
    // Why the first call records it: later calls inherit one look, view and light.
    record(
      Object.fromEntries(
        Object.entries(chosen).filter(([key]) => figure.recorded[key] === undefined)
      )
    )
    return chosen
  }
  /** Draws what the spec names into a builder; returns the builder, anchors and scene items. */
  const build = (spec, chosen) => {
    const b = isoBuilder({ view: chosen.view, light: chosen.light })
    const anchors = {}
    const items = []
    const placeOne = (item, index) => {
      if (typeof item.draw === 'function') {
        const list = b.capture((inner) =>
          inner.place(
            { at: item.at ?? [0, 0, 0], scale: item.scale ?? 1, roles: item.roles ?? {} },
            item.draw
          )
        )
        items.push({ id: item.id ?? `drawn-${index}`, name: 'drawn', list })
        return
      }
      const name = item.asset ?? item.object
      const entry = ILLUSTRATION_OBJECTS[name]
      if (!entry) {
        throw new Error(
          `No drawn object "${name}" for a scene item; \`figures kit illustrations ${name ?? ''}\` searches`
        )
      }
      const at = item.at ?? [0, 0, 0]
      const list = b.capture((inner) =>
        inner.place(
          { at, scale: item.scale ?? 1, roles: item.roles ?? {}, mirror: Boolean(item.mirror) },
          (placed) => {
            entry.draw(placed, item.options ?? {})
            for (const [anchor, point] of Object.entries(
              entry.anchors?.(item.options ?? {}) ?? {}
            )) {
              anchors[`${item.id ?? name}.${anchor}`] = placed.project(point)
            }
          }
        )
      )
      items.push({ id: item.id ?? `${name}-${index}`, name, list })
    }
    if (spec.scene) {
      groundOf(b, spec)
      // Why a floor layer: paths and marks on the floor go under every object standing on it.
      const order = spec.scene
        .map((item, index) => ({
          item,
          index,
          depth: item.layer === 'floor' ? -Infinity : b.depth(item.at ?? [0, 0, 0])
        }))
        .toSorted((a, c) => a.depth - c.depth)
      for (const { item, index } of order) {
        placeOne(item, index)
      }
    } else if (typeof spec.draw === 'function') {
      spec.draw(b)
    } else {
      placeOne(
        {
          asset: spec.asset ?? spec.object,
          options: spec.options,
          mirror: spec.mirror,
          id: 'object'
        },
        0
      )
      for (const [key, point] of Object.entries(anchors)) {
        anchors[key.replace(/^object\./, '')] = point
        delete anchors[key]
      }
    }
    for (const item of items) {
      b.list.append(item.list)
    }
    return { b, anchors, items }
  }
  /** A floor under a scene: a tile (`ground: 'tile'`) or a room's floor and two back walls. */
  const groundOf = (b, spec) => {
    const kind = typeof spec.ground === 'object' ? (spec.ground.kind ?? 'tile') : spec.ground
    if (!kind || kind === 'none') {
      return
    }
    const pad = spec.ground?.pad ?? 24
    const xs = spec.scene.map((item) => item.at?.[0] ?? 0)
    const ys = spec.scene.map((item) => item.at?.[1] ?? 0)
    const [x0, y0] = [Math.min(...xs) - pad, Math.min(...ys) - pad]
    const size = spec.ground?.size ?? [
      Math.max(...xs) - x0 + pad * 2.4,
      Math.max(...ys) - y0 + pad * 2.4
    ]
    const role = spec.ground?.role ?? 'neutral'
    b.box({
      at: [x0, y0, -4],
      size: [size[0], size[1], 4],
      radius: kind === 'tile' ? 4 : 0,
      role,
      tone: 1
    })
    if (kind === 'room') {
      // Why pale walls: they are the stage, so even the wall turned from the light stays light.
      const wall = spec.ground?.wall ?? 90
      b.box({ at: [x0 - 6, y0 - 6, -4], size: [6, size[1] + 6, wall], role, tone: 0 })
      b.box({ at: [x0, y0 - 6, -4], size: [size[0], 6, wall], role, tone: 0 })
    }
  }
  /** Fits the drawing into `w` × `h` (either, both or neither) keeping its aspect. */
  const fit = (spec, bounds) => {
    const aspect = bounds.width / bounds.height
    let width = spec.w
    let height = spec.h
    if (width === undefined && height === undefined) {
      height = DEFAULT_HEIGHT
    }
    const boxW = width ?? height * aspect
    const boxH = height ?? width / aspect
    const fitted =
      boxW / boxH > aspect
        ? { width: boxH * aspect, height: boxH }
        : { width: boxW, height: boxW / aspect }
    const x = (spec.x ?? 0) + (boxW - fitted.width) / 2
    const y = (spec.y ?? 0) + (boxH - fitted.height) / 2
    return { x, y, ...fitted }
  }
  const place = (spec, svg, meta, extra = {}) => {
    // Why the shared path: plots and illustrations are stored, made safe and pruned one way.
    const { fileId } = core.files.embed('aster-ill-', svg)
    const element = figureElement('image', {
      id: spec.id,
      x: r2(meta.box.x),
      y: r2(meta.box.y),
      width: r2(meta.box.width),
      height: r2(meta.box.height),
      fileId,
      status: 'saved',
      scale: [1, 1],
      crop: null,
      strokeColor: 'transparent',
      boundElements: [],
      frameId: spec.frame ?? null,
      groupIds: spec.groupIds ?? [],
      customData: { asterIllustration: meta.record }
    })
    core.add([element], spec.id)
    const box = meta.box
    return {
      element,
      id: spec.id,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      right: box.x + box.width,
      bottom: box.y + box.height,
      ...extra
    }
  }
  return {
    /**
     * The figure's illustration look (`style`: flat, tonal, line or mono), projection (`view`),
     * light and skin tone, kept on the page; every illustration inherits them.
     */
    illustrationStyle(next = {}) {
      const look = oneOf('style', next.style ?? next.look, Object.keys(ILLUSTRATION_STYLES))
      const view = oneOf('view', next.view, Object.keys(VIEWS))
      const light = oneOf('light', next.light, LIGHT_NAMES)
      const skin = oneOf('skin', next.skin, Object.keys(SKIN_TONES))
      record(
        Object.fromEntries(
          Object.entries({ look, view, light, skin }).filter(([, value]) => value !== undefined)
        )
      )
      const current = settings()
      return { look: current.look, view: current.view, light: current.light, skin: current.skin }
    },
    /** Drawn objects and bundled assets matching a query (`figures kit illustrations <query>`). */
    illustrations: (query) => searchIllustrations(query, bundledAssets()),
    /**
     * An illustration as one vector image: `asset` (a drawn object or a bundled asset by name),
     * `scene` (objects at world points on an optional `ground`), `draw` (your own, with the
     * builder) or `svg`. `style` is the house look; `roles` repaint colour roles
     * (`{ accent: 'second' }`, `{ accent: '#d95f02' }`). Returns its box, `anchors` (named
     * points in scene units) and `point([x, y, z])` for any world point.
     */
    illustration(spec) {
      if (!spec?.id) {
        throw new Error('illustration({ id, asset | scene | draw | svg, x, y, w }) needs an id')
      }
      const sources = ['asset', 'object', 'scene', 'draw', 'svg'].filter(
        (key) => spec[key] !== undefined
      )
      if (sources.length !== 1) {
        throw new Error(`illustration ${spec.id} takes exactly one of asset, scene, draw or svg`)
      }
      const chosen = choose(spec)
      const style = styleNow()
      const name = spec.asset ?? spec.object
      const bundled =
        name && !ILLUSTRATION_OBJECTS[name]
          ? bundledAssets().find((asset) => asset.name === name)
          : null
      if (name && !ILLUSTRATION_OBJECTS[name] && !bundled) {
        const near = [
          ...new Set(
            name
              .split(/[^a-z0-9]+/i)
              .filter((word) => word.length > 2)
              .flatMap((word) => searchIllustrations(word.slice(0, 5), bundledAssets()))
              .map((record) => record.name)
          )
        ].slice(0, 4)
        throw new Error(
          `No illustration "${name}"${near.length ? `; close: ${near.join(', ')}` : ''}. \`figures kit illustrations <words>\` searches; or draw it with draw: (b) => …`
        )
      }
      const record = {
        source: spec.scene
          ? 'scene'
          : spec.draw
            ? 'drawn'
            : spec.svg
              ? 'svg'
              : bundled
                ? 'asset'
                : 'object',
        name: name ?? null,
        look: chosen.look,
        view: chosen.view,
        light: chosen.light,
        skin: chosen.skin,
        roles: spec.roles ?? {},
        projection: bundled
          ? (bundled.projection ?? 'front')
          : name
            ? objectProjection(name, chosen.view)
            : spec.svg
              ? 'front'
              : chosen.view,
        ...(spec.options ? { options: spec.options } : {}),
        ...(bundled ? { licence: bundled.licence, credit: bundled.credit ?? null } : {}),
        ...(spec.scene
          ? { items: spec.scene.map((item) => item.asset ?? item.object ?? 'drawn') }
          : {})
      }
      if (spec.svg !== undefined || bundled) {
        const raw = bundled ? assetSvg(bundled) : String(spec.svg)
        const { vw, vh } = viewBoxOf(raw)
        const box = fit(spec, { width: vw, height: vh })
        const tagged = /data-aster-illustration/.test(raw)
        if (!tagged) {
          warn(
            `${spec.id}: this SVG has no colour roles, so it keeps its own colours and will not follow the figure's palette`
          )
        }
        const svg = tagged
          ? paintIllustrationSvg(
              withScale(raw, box.width),
              illustrationPalette(style, { roles: spec.roles, skin: chosen.skin }),
              { look: chosen.look }
            )
          : raw
        return place(spec, svg, { box, record: { ...record, tagged } })
      }
      const { b, anchors, items } = build(spec, chosen)
      const bounds = b.bounds()
      const pad = 2
      const box = fit(spec, { width: bounds.width + pad * 2, height: bounds.height + pad * 2 })
      const svg = b.svg({
        look: chosen.look,
        style,
        roles: spec.roles,
        skin: chosen.skin,
        width: box.width,
        pad
      })
      const { vx, vy, vw } = viewBoxOf(svg)
      const k = box.width / vw
      const toScene = ([px, py]) => [r2(box.x + (px - vx) * k), r2(box.y + (py - vy) * k)]
      return place(
        spec,
        svg,
        { box, record },
        {
          anchors: Object.fromEntries(
            Object.entries(anchors).map(([key, point]) => [key, toScene(point)])
          ),
          items: items.map((item) => {
            const ib = item.list.bounds()
            const [x, y] = toScene([ib.x, ib.y])
            return {
              id: item.id,
              name: item.name,
              x,
              y,
              width: r2(ib.width * k),
              height: r2(ib.height * k)
            }
          }),
          point: (world) => toScene(b.project(world))
        }
      )
    },
    /**
     * A label beside an illustration joined to a point on it by a right-angle leader (across,
     * then one drop) that ends in a dot: `to` [x, y] (an anchor), `text`, and where the text
     * sits: `at` [x, y] (its left end, or right end with `align: 'right'`).
     */
    leader(spec) {
      if (!spec?.id || !Array.isArray(spec.to) || !Array.isArray(spec.at)) {
        throw new Error('leader({ id, to: [x, y], at: [x, y], text }) needs an id, to and at')
      }
      const style = styleNow()
      const size = spec.size ?? style.smallSize
      const right = spec.align === 'right'
      const where = {
        id: `${spec.id}-text`,
        x: spec.at[0],
        y: spec.at[1],
        size,
        align: right ? 'right' : 'left',
        frame: spec.frame
      }
      // Why runs for math: '$x_t$', a tex label or TeX-only characters typeset as in fig.text.
      const source = spec.tex !== undefined ? `$${spec.tex}$` : String(spec.text ?? '')
      const typeset = spec.tex !== undefined || hasInlineMath(source) || needsTex(source, style)
      const parts = typeset
        ? makeLines(styled(where), labelLines([source], size, undefined, style)).elements
        : makeText(styled({ ...where, text: source }))
      const boxes = parts.map((part) => elementBounds(part))
      const text = {
        x: Math.min(...boxes.map((box) => box.x)),
        y: Math.min(...boxes.map((box) => box.y)),
        width: Math.max(...boxes.map((box) => box.right)) - Math.min(...boxes.map((box) => box.x)),
        height: Math.max(...boxes.map((box) => box.bottom)) - Math.min(...boxes.map((box) => box.y))
      }
      const labelY = text.y + text.height / 2
      const [tx, ty] = spec.to
      // Why a drop when the target is under the text: a run across would strike through it.
      const over = tx >= text.x - 2 && tx <= text.x + text.width + 2
      const towardRight = spec.to[0] >= text.x + text.width / 2
      const startX = towardRight ? text.x + text.width + 4 : text.x - 4
      const points = over
        ? [
            [tx, ty > labelY ? text.y + text.height + 3 : text.y - 3],
            [tx, ty]
          ]
        : Math.abs(labelY - ty) < 2
          ? [
              [startX, labelY],
              [tx, labelY]
            ]
          : [
              [startX, labelY],
              [tx, labelY],
              [tx, ty]
            ]
      const line = makePolyline(
        styled({
          id: `${spec.id}-line`,
          points,
          color: spec.color ?? 'muted',
          strokeWidth: 1,
          frame: spec.frame
        })
      )
      const dot = makeDot(
        styled({
          id: `${spec.id}-dot`,
          cx: tx,
          cy: ty,
          r: 1.5,
          color: spec.color ?? 'line',
          frame: spec.frame
        })
      )
      core.claim(spec.id, [...parts, line, ...dot])
      core.insert([line, ...dot, ...parts])
      return {
        id: spec.id,
        text: parts[0],
        line,
        x: text.x,
        y: text.y,
        width: text.width,
        height: text.height
      }
    }
  }
}
