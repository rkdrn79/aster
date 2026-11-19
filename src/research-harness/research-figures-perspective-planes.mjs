// Structured planes in a perspective scene: tri-planes (three axis-aligned feature planes, as
// EG3D draws them, with a query point projected onto each), patch grids with a window overlay
// (Swin) and stacks of parallel feature-map planes.
import { add, length, mul } from './research-figures-perspective-camera.mjs'

export function planeMethods(scene) {
  const { anchor, nextId, rectFace, loadPhoto, records } = scene
  return {
    /**
     * Three axis-aligned feature planes through `at` (`layout: 'cross'`, as EG3D draws them)
     * or on the walls of a corner (`'corner'`), each `size` wide with a `grid`, a role and an
     * optional photo; `point` adds a query point with dashed projections onto each plane.
     */
    triplane(spec = {}) {
      const id = spec.id ?? nextId('triplane')
      const c = spec.at ?? [0, 0, 0]
      const s = spec.size ?? 2
      const grid = spec.grid ?? 8
      const roles = spec.roles ?? {}
      const names = spec.planes ?? ['xy', 'xz', 'yz']
      const corner = spec.layout === 'corner'
      const frames = {
        xy: { u: [1, 0, 0], v: [0, -1, 0], at: corner ? add(c, [0, 0, -s / 2]) : c },
        xz: { u: [1, 0, 0], v: [0, 0, -1], at: corner ? add(c, [0, s / 2, 0]) : c },
        yz: { u: [0, 1, 0], v: [0, 0, -1], at: corner ? add(c, [-s / 2, 0, 0]) : c }
      }
      const feet = {}
      for (const name of names) {
        const frame = frames[name]
        const planeId = `${id}.${name}`
        const style = {
          role: roles[name] ?? spec.role ?? 'neutral',
          tone: spec.tone ?? 1,
          opacity: spec.opacity ?? 1,
          edge: spec.edge ?? { role: 'ink', tone: 10, pt: 0.55 }
        }
        const photo = spec.photos?.[name] ? loadPhoto(spec.photos[name], 1) : null
        const quarters = corner
          ? [[0, 0, 1]]
          : [
              [0, 0, 0.5],
              [0.5, 0, 0.5],
              [0, 0.5, 0.5],
              [0.5, 0.5, 0.5]
            ]
        for (const [s0, t0, span] of quarters) {
          const rect = {
            center: add(
              add(frame.at, mul(frame.u, s * (s0 + span / 2 - 0.5))),
              mul(frame.v, s * (t0 + span / 2 - 0.5))
            ),
            size: [s * span, s * span],
            u: frame.u,
            v: frame.v
          }
          const sub = photo
            ? {
                ...photo,
                crop: [
                  photo.crop[0] + (photo.crop[2] - photo.crop[0]) * s0,
                  photo.crop[1] + (photo.crop[3] - photo.crop[1]) * t0,
                  photo.crop[0] + (photo.crop[2] - photo.crop[0]) * (s0 + span),
                  photo.crop[1] + (photo.crop[3] - photo.crop[1]) * (t0 + span)
                ]
              }
            : null
          rectFace(
            {
              ...style,
              grid: {
                role: style.role,
                tone: 5,
                pt: 0.4,
                ...spec.gridStroke,
                n: Math.max(1, Math.round(grid * span))
              }
            },
            rect,
            planeId,
            {
              photo: sub,
              group: planeId
            }
          )
        }
        const far = add(add(frame.at, mul(frame.u, s / 2)), mul(frame.v, -s / 2))
        anchor(planeId, frame.at)
        anchor(`${planeId}.corner`, far)
        anchor(`${planeId}.edge`, add(frame.at, mul(frame.u, s / 2)))
        records.planes += 1
        if (spec.point) {
          const p = spec.point
          const foot = {
            xy: [p[0], p[1], frame.at[2]],
            xz: [p[0], frame.at[1], p[2]],
            yz: [frame.at[0], p[1], p[2]]
          }[name]
          feet[name] = foot
        }
      }
      if (spec.point) {
        scene.point({ id: `${id}.point`, at: spec.point, r: 2, role: spec.pointRole ?? 'bad' })
        for (const [name, foot] of Object.entries(feet)) {
          scene.line({
            id: `${id}.proj-${name}`,
            points: [spec.point, foot],
            role: 'ink',
            tone: 10,
            pt: 0.5,
            dash: 'dashed'
          })
          scene.point({
            id: `${id}.${name}.foot`,
            at: foot,
            r: 1.6,
            role: roles[name] ?? spec.footRole ?? 'ink',
            tone: 8
          })
        }
      }
      anchor(id, c)
      return { id, center: c, size: s, feet }
    },
    /**
     * A picture cut into patches with a window overlay (Swin): `patches` per side, `windows`
     * per side drawn heavier in colour; `gap` separates the windows into tiles.
     */
    patchGrid(spec = {}) {
      const id = spec.id ?? nextId('patches')
      const center = spec.at ?? [0, 0, 0]
      const size = spec.size ?? 2
      const patches = spec.patches ?? 8
      const windows = spec.windows ?? 2
      const gap = spec.gap ?? 0
      const axes = spec.axes ?? 'xy'
      const frame = {
        xy: { u: [1, 0, 0], v: [0, -1, 0] },
        xz: { u: [1, 0, 0], v: [0, 0, -1] },
        yz: { u: [0, 1, 0], v: [0, 0, -1] }
      }[axes]
      const windowStroke = { role: spec.role ?? 'accent', tone: spec.tone ?? 7, pt: spec.pt ?? 0.8 }
      // Why a mid tone for coloured patch lines: ink at tone 0 printed white on a pale map.
      const patchRole = spec.patchRole ?? 'white'
      const patchStroke = {
        role: patchRole,
        tone: spec.patchTone ?? (patchRole === 'white' ? 0 : 6),
        pt: spec.patchPt ?? 0.4
      }
      const photo = spec.photo ? loadPhoto(spec.photo, 1) : null
      // Why: patchGap pulls every patch apart (ViT patch tokens); each keeps its piece of photo.
      const apart = spec.patchGap ?? 0
      const [count, spacing] = apart > 0 ? [patches, apart] : [windows, gap]
      const tile = (size - spacing * (count - 1)) / count
      const perTile = apart > 0 ? 1 : Math.max(1, Math.round(patches / windows))
      const style = {
        role: spec.fill ?? (photo ? 'white' : 'neutral'),
        tone: spec.fillTone ?? 1,
        opacity: spec.opacity ?? 1
      }
      if (gap > 0 || apart > 0) {
        for (let i = 0; i < count; i += 1) {
          for (let j = 0; j < count; j += 1) {
            const offset = [
              i * (tile + spacing) + tile / 2 - size / 2,
              j * (tile + spacing) + tile / 2 - size / 2
            ]
            const rect = {
              center: add(add(center, mul(frame.u, offset[0])), mul(frame.v, offset[1])),
              size: [tile, tile],
              ...frame
            }
            const share = (k) => (k * (tile + spacing)) / size
            const sub = photo
              ? {
                  ...photo,
                  crop: [
                    photo.crop[0] + (photo.crop[2] - photo.crop[0]) * share(i),
                    photo.crop[1] + (photo.crop[3] - photo.crop[1]) * share(j),
                    photo.crop[0] + (photo.crop[2] - photo.crop[0]) * (share(i) + tile / size),
                    photo.crop[1] + (photo.crop[3] - photo.crop[1]) * (share(j) + tile / size)
                  ]
                }
              : null
            rectFace(
              {
                ...style,
                grid: { n: perTile, ...patchStroke },
                edge: apart > 0 ? { role: 'ink', tone: 8, pt: spec.patchPt ?? 0.4 } : windowStroke
              },
              rect,
              `${id}.w${i}-${j}`,
              { photo: sub, group: id }
            )
          }
        }
      } else {
        rectFace(
          {
            ...style,
            grid: { n: patches, ...patchStroke },
            windows: windows > 1 ? { n: windows, ...windowStroke } : null,
            edge: windowStroke
          },
          { center, size: [size, size], ...frame },
          id,
          { photo }
        )
      }
      records.planes += 1
      const corners = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1]
      ].map(([a, b]) =>
        add(add(center, mul(frame.u, (a * size) / 2)), mul(frame.v, (b * size) / 2))
      )
      anchor(id, center)
      ;['tl', 'tr', 'br', 'bl'].forEach((name, index) => anchor(`${id}.${name}`, corners[index]))
      // Edge middles by the picture's own axes: right/left along u, top (its far edge)/bottom along v.
      anchor(`${id}.right`, add(center, mul(frame.u, size / 2)))
      anchor(`${id}.left`, add(center, mul(frame.u, -size / 2)))
      anchor(`${id}.top`, add(center, mul(frame.v, -size / 2)))
      anchor(`${id}.bottom`, add(center, mul(frame.v, size / 2)))
      return { id, center, size, corners }
    },
    /** `count` parallel planes `offset` apart (feature maps, layers); ids `<id>-0` …. */
    stack(spec = {}) {
      const id = spec.id ?? nextId('stack')
      const count = spec.count ?? 3
      const offset = spec.offset ?? [0.15, 0, 0]
      const start = spec.at ?? [0, 0, 0]
      const planes = []
      for (let index = 0; index < count; index += 1) {
        const at = add(start, mul(offset, index))
        planes.push(
          scene.plane({
            ...spec,
            id: `${id}-${index}`,
            at,
            photo: index === count - 1 ? spec.photo : (spec.photos?.[index] ?? null)
          })
        )
      }
      anchor(id, add(start, mul(offset, (count - 1) / 2)))
      anchor(`${id}.front`, start)
      anchor(`${id}.back`, add(start, mul(offset, count - 1)))
      return { id, planes, depth: length(mul(offset, count - 1)) }
    }
  }
}
