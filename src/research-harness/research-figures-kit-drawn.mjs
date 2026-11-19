// The drawn glyphs of tensors and pictures (research-figures-drawn): a tensor cuboid with grid
// faces and size labels, stacked feature planes (front-facing or turned sideways, or a staircase
// of shrinking levels), VAR's multi-scale token maps on a pedestal, and a 3D filmstrip of video
// frames. All in the family's one oblique view, native shapes, pictures as project images.
import {
  FACE_SHADE,
  adopt,
  boxOf,
  depthOffset,
  drawnParts,
  roleTones,
  shade
} from './research-figures-drawn.mjs'
import {
  cuboidParts,
  filmFrames,
  labelRoom,
  levelList,
  moveBefore,
  nameLabel,
  num,
  shiftAll,
  stackParts,
  stackSize
} from './research-figures-drawn-parts.mjs'

export { cuboidParts, moveBefore, photoSpec, shiftAll } from './research-figures-drawn-parts.mjs'

export function drawnMethods(core, context) {
  const style = () => core.styled({}).style
  const fig = () => context().fig
  const project = () => context().project
  /** Places the images a glyph needs, under its grid lines, as part of the glyph. */
  const placePhotos = (owner, photos) => {
    for (const { photo, under } of photos) {
      fig().image(photo)
      adopt(core, owner, [photo.id])
      moveBefore(core, [photo.id], under)
    }
  }
  const finish = (spec, elements, photos, box, extra = {}) => {
    const parts = drawnParts(spec, style())
    // Why everything drawn: the name goes under the size labels, not over them.
    const label = nameLabel(parts, spec, boxOf([box, ...elements]), style())
    core.add([parts.holder(box), ...elements, ...label], spec.id)
    placePhotos(spec.id, photos)
    const all = boxOf([box, ...label])
    return { id: spec.id, ...box, ...extra, bounds: all }
  }
  return {
    /**
     * A tensor or feature map as a cuboid: a front face w × h (true shape), its depth d receding
     * up and to the right, grid lines on all three faces, size labels on the edges.
     */
    tensor(spec) {
      const parts = drawnParts(spec, style())
      const room = labelRoom(spec, style())
      const made = cuboidParts(
        parts,
        room && spec.base === undefined ? { ...spec, y: num(spec.y, 0) + room } : spec,
        style(),
        project()
      )
      const photos = made.photo ? [{ photo: made.photo, under: made.under }] : []
      const { geometry } = made
      return finish(spec, made.elements, photos, boxOf([geometry]), {
        front: geometry.front,
        anchors: geometry.anchors
      })
    },
    /**
     * Feature planes: `count` planes stacked one behind another (facing 'front', each a true
     * rectangle, the back ones up and to the right) or turned sideways (facing 'side', parallel
     * parallelograms left to right, DenseNet), filled on a ramp from dark (back) to pale (front);
     * or `levels`, a staircase of such stacks shrinking (or growing) left to right.
     */
    planes(spec) {
      const s = style()
      const parts = drawnParts(spec, s)
      const levels = levelList(spec)
      const elements = []
      const photos = []
      const placed = []
      let x = num(spec.x, 0)
      const sizes = levels.map((level) => stackSize(level, spec))
      const tallest = Math.max(...sizes.map((size) => size.height))
      // Why: x, y is the top-left of everything drawn, names over the levels included.
      const named = spec.labelSide === 'above' && levels.some((level) => level.label)
      const top = num(spec.y, 0) + (named ? s.smallSize * 1.4 + 3 : 0)
      for (const [index, level] of levels.entries()) {
        const size = sizes[index]
        const y =
          spec.align === 'center'
            ? top + (tallest - size.height) / 2
            : spec.align === 'top'
              ? top
              : top + tallest - size.height
        const made = stackParts(
          parts,
          { ...spec, ...level, id: `${spec.id}-l${index}` },
          s,
          project(),
          x,
          y
        )
        elements.push(...made.elements)
        photos.push(...made.photos)
        placed.push({ ...made.geometry, index })
        if (level.label) {
          const box = made.geometry
          const label = parts.words(
            `${spec.id}-l${index}-label`,
            level.label,
            { cx: box.x + box.width / 2, y: 0 },
            { size: s.smallSize }
          )
          const y0 = spec.labelSide === 'above' ? box.y - label.height - 3 : box.bottom + 3
          elements.push(...shiftAll(label.elements, 0, y0 - label.y))
        }
        x += size.width + num(spec.spacing, 24)
      }
      const box = boxOf(
        placed.map((item) => ({ x: item.x, y: item.y, width: item.width, height: item.height }))
      )
      const result = finish(spec, elements, photos, box, {
        levels: placed,
        planes: placed.flatMap((item) => item.planes)
      })
      if (spec.arrows && placed.length > 1) {
        for (let index = 0; index + 1 < placed.length; index += 1) {
          const [a, b] = [placed[index], placed[index + 1]]
          const y = (a.height < b.height ? a : b).anchors.center[1]
          if (b.x - a.right >= 16) {
            const arrow = `${spec.id}-step${index}`
            fig().arrow({
              id: arrow,
              from: [a.right + 3, y],
              to: [b.x - 3, y],
              role: spec.arrowRole ?? 'data'
            })
            adopt(core, spec.id, [arrow])
          }
        }
      }
      return result
    },
    /**
     * Multi-scale token maps on a pedestal (VAR): maps r_1 … r_K growing left to right, each a
     * thin cuboid whose face shows the picture pixelated at its scale (the last the picture
     * itself), standing on a long slab that names the model, dotted guides along their corners.
     */
    tokenMaps(spec) {
      const s = style()
      const parts = drawnParts(spec, s)
      const scales = Array.isArray(spec.scales)
        ? spec.scales
        : [1, 2, 3, 4, 16].slice(-num(spec.scales, 5))
      const count = scales.length
      const w = num(spec.w, 360)
      const pedestal =
        spec.pedestal === false
          ? null
          : {
              h: 22,
              depth: 64,
              role: spec.role ?? 'c',
              ...(typeof spec.pedestal === 'object' ? spec.pedestal : {})
            }
      const [pdx, pdy] = pedestal ? depthOffset(pedestal.depth, spec.view) : [0, 0]
      const x0 = num(spec.x, 0)
      const shares =
        spec.sizes ??
        scales.map((_, index) => 0.2 + 0.8 * (count > 1 ? index / (count - 1) : 1) ** 1.25)
      // Why: w × h holds everything (names, the largest map's top, the slab), so the maps get
      // what is left.
      const labelsH = spec.labels === false ? 0 : s.smallSize * 1.4 + 2
      const rise = -depthOffset(0.22, spec.view)[1]
      const lift = -pdy * 0.35 + (pedestal?.h ?? 0)
      const largest = Math.max(...shares)
      const dotsW = spec.dots !== false && count > 2 ? 26 : 0
      const across = shares.reduce(
        (sum, share) => sum + share * (1 + depthOffset(0.22, spec.view)[0]),
        0
      )
      // Why the smaller of the two: the maps must fit the slab's width as well as the height.
      const fitW = (w - Math.abs(pdx) - 16 - dotsW - 12 * (count - 1)) / across
      const h = Math.max(
        24,
        Math.min(fitW, (num(spec.h, 160) - labelsH - lift) / ((1 + rise) * largest))
      )
      const y0 = num(spec.y, 0)
      const base = y0 + labelsH + (1 + rise) * h * largest
      const mapW = (index) => h * shares[index]
      const thick = (index) => Math.max(6, mapW(index) * 0.22)
      const dots = spec.dots !== false && count > 2 ? 26 : 0
      const widths = scales.map((_, index) => mapW(index) + depthOffset(thick(index), spec.view)[0])
      const usable = w - (pedestal ? Math.abs(pdx) : 0) - 16
      const gap = Math.max(
        8,
        (usable - widths.reduce((sum, value) => sum + value, 0) - dots) / Math.max(1, count - 1)
      )
      // Why a little back on the slab: the maps stand on its top face, not on its front edge.
      const elements = []
      const photos = []
      const maps = []
      let x = x0 + 8 + Math.abs(pdx) * 0.35
      const tones = roleTones(s, spec.role ?? 'c')
      for (const [index, scale] of scales.entries()) {
        if (dots && index === count - 1) {
          const cy = base - mapW(index - 1) / 2
          for (const k of [0, 1, 2]) {
            elements.push(
              ...parts.dot(`${spec.id}-dot${k}`, x - gap / 2 + dots / 2 - 6 + k * 6, cy, 1.6, s.ink)
            )
          }
          x += dots
        }
        const last = index === count - 1 && spec.last !== 'pixelate'
        const made = cuboidParts(
          parts,
          {
            id: `${spec.id}-r${index + 1}`,
            x,
            base,
            w: mapW(index),
            h: mapW(index),
            d: thick(index),
            view: spec.view,
            role: spec.mapRole ?? spec.role ?? 'c',
            fill: tones.fill,
            photo: spec.photo,
            pixelate: last ? false : scale,
            grid: last || spec.photo ? false : scale
          },
          s,
          project()
        )
        elements.push(...made.elements)
        if (made.photo) {
          photos.push({ photo: made.photo, under: made.under })
        }
        maps.push(made.geometry)
        x += widths[index] + gap
      }
      const names =
        spec.labels === false
          ? []
          : Array.isArray(spec.labels)
            ? spec.labels
            : scales.map((_, index) => (index === count - 1 ? '$r_K$' : `$r_{${index + 1}}$`))
      for (const [index, name] of names.entries()) {
        const map = maps[index]
        if (!map || !name) {
          continue
        }
        const label = parts.words(
          `${spec.id}-name${index + 1}`,
          name,
          { x: map.front.x, y: 0 },
          { size: s.smallSize }
        )
        elements.push(...shiftAll(label.elements, 0, map.y - label.height - 2 - label.y))
      }
      if (spec.guides !== false && maps.length > 1) {
        const [first, end] = [maps[0], maps.at(-1)]
        // Why first: the guides pass behind the maps, as a designer draws them.
        elements.unshift(
          parts.line(
            `${spec.id}-guide-top`,
            [
              [first.front.x, first.front.y],
              [end.front.x, end.front.y]
            ],
            { stroke: s.muted, width: 1, dotted: true }
          ),
          parts.line(
            `${spec.id}-guide-back`,
            [
              [first.right, first.y],
              [end.right, end.y]
            ],
            { stroke: s.muted, width: 1, dotted: true }
          )
        )
      }
      if (pedestal) {
        const slab = cuboidParts(
          parts,
          {
            id: `${spec.id}-pedestal`,
            x: x0,
            base: base - pdy * 0.35 + pedestal.h,
            w: w - Math.abs(pdx),
            h: pedestal.h,
            d: pedestal.depth,
            view: spec.view,
            role: pedestal.role,
            grid: false
          },
          s,
          project()
        )
        // Why first: the maps stand on the slab, so it is painted under them.
        elements.unshift(...slab.elements)
        if (pedestal.label) {
          const label = parts.words(
            `${spec.id}-pedestal-label`,
            pedestal.label,
            { x: slab.geometry.front.x + 8, cy: slab.geometry.front.y + pedestal.h / 2 },
            { size: s.textSize }
          )
          elements.push(...label.elements)
        }
      }
      const box = boxOf([
        ...maps.map((map) => ({ x: map.x, y: map.y, width: map.width, height: map.height })),
        { x: x0, y: y0, width: w, height: base - y0 + lift }
      ])
      return finish(spec, elements, photos, box, {
        maps: maps.map((map, index) => ({
          id: `${spec.id}-r${index + 1}`,
          ...map.front,
          anchors: map.anchors
        }))
      })
    },
    /**
     * A video as a 3D filmstrip: frames side by side on the front of a thin box whose top and end
     * recede, seams carried over the top, an ellipsis of dots at either end (Make-A-Video).
     */
    filmstrip(spec) {
      const s = style()
      const parts = drawnParts(spec, s)
      const sources = filmFrames(spec)
      const n = sources.length
      const w = num(spec.w, 40)
      const h = num(spec.h, 32)
      const gap = num(spec.gap, 0)
      const [dx, dy] = depthOffset(num(spec.d, num(spec.depth, 40)), spec.view)
      const fx = num(spec.x, 0) + (spec.dots === false || spec.dots === 'end' ? 0 : 20)
      const fy = num(spec.y, 0) + labelRoom(spec, s) - dy
      const right = fx + n * w + (n - 1) * gap
      const tones = roleTones(s, spec.role ?? 'ink')
      const edge = spec.role ? tones.solid : s.line
      const elements = [
        parts.poly(
          `${spec.id}-top`,
          [
            [fx, fy],
            [fx + dx, fy + dy],
            [right + dx, fy + dy],
            [right, fy]
          ],
          { fill: '#ffffff', stroke: edge }
        ),
        parts.poly(
          `${spec.id}-end`,
          [
            [right, fy],
            [right + dx, fy + dy],
            [right + dx, fy + h + dy],
            [right, fy + h]
          ],
          { fill: shade('#ffffff', FACE_SHADE.side), stroke: edge, shade: FACE_SHADE.side }
        )
      ]
      const photos = []
      for (const [index, frame] of sources.entries()) {
        const x = fx + index * (w + gap)
        photos.push({
          photo: { ...frame, id: `${spec.id}-f${index}`, x, y: fy, w, h, fit: 'cover' },
          under: `${spec.id}-seams`
        })
      }
      const seams = []
      for (let index = 1; index < n; index += 1) {
        const x = fx + index * (w + gap) - gap / 2
        seams.push([
          [x, fy + h],
          [x, fy],
          [x + dx, fy + dy]
        ])
      }
      elements.push(
        parts.line(
          `${spec.id}-seams`,
          seams.length
            ? seams.flatMap((seam, index) => (index % 2 ? seam.toReversed() : seam))
            : [
                [fx, fy],
                [fx, fy]
              ],
          { stroke: edge, width: 1 }
        ),
        parts.rect(`${spec.id}-edge`, fx, fy, right - fx, h, { stroke: edge })
      )
      const dotColor = spec.role ? tones.solid : s.ink
      const ends =
        spec.dots === false
          ? []
          : spec.dots === 'start'
            ? ['start']
            : spec.dots === 'end'
              ? ['end']
              : ['start', 'end']
      for (const end of ends) {
        const x = end === 'start' ? fx - 16 : right + dx + 6
        for (const k of [0, 1, 2]) {
          elements.push(
            ...parts.dot(
              `${spec.id}-${end}${k}`,
              x + k * 5,
              fy + h / 2 + (end === 'end' ? dy / 2 : 0),
              1.5,
              dotColor
            )
          )
        }
      }
      const box = {
        x: fx - (ends.includes('start') ? 20 : 0),
        y: fy + dy,
        width:
          right + dx - fx + (ends.includes('start') ? 20 : 0) + (ends.includes('end') ? 20 : 0),
        height: h - dy
      }
      box.right = box.x + box.width
      box.bottom = box.y + box.height
      return finish(spec, elements, photos, box, {
        frames: sources.map((_, index) => ({
          id: `${spec.id}-f${index}`,
          x: fx + index * (w + gap),
          y: fy,
          w,
          h
        })),
        anchors: {
          left: [fx, fy + h / 2],
          right: [right + dx / 2, fy + h / 2 + dy / 2],
          top: [(fx + right + dx) / 2, fy + dy / 2],
          bottom: [(fx + right) / 2, fy + h]
        }
      })
    }
  }
}
