// Objects in a perspective scene: camera glyphs (a wire pyramid or a solid body, with a view
// frustum and an image plane in front) and boxes (lit solids or the twelve edges of a bounding
// box), built on the scene's units.
import { add, cross, dot, length, mul, sub, unit } from './research-figures-perspective-camera.mjs'
import { sceneRole, strokeOf } from './research-figures-perspective-scene.mjs'
import { planarUvs } from './research-figures-perspective-photo.mjs'

const BOX_SIDES = ['bottom', 'top', 'front', 'back', 'left', 'right']

export function objectMethods(api) {
  const { units, anchor, nextId, cameras, records } = api
  return {
    /**
     * A camera glyph at `at` looking at `lookAt`: style 'pyramid' (a wire lens) or 'body' (a
     * solid camera); `frustum: { far, role, opacity }` its view cone; `imagePlane: { distance,
     * size, grid, photo }` a picture plane in front of it. Returns the camera's axes.
     */
    camera(spec = {}) {
      const id = spec.id ?? nextId('camera')
      const center = spec.at ?? [0, -4, 1]
      const forward = unit(sub(spec.lookAt ?? [0, 0, 0], center))
      let right = cross(forward, spec.up ?? [0, 0, 1])
      right = length(right) < 1e-6 ? [1, 0, 0] : unit(right)
      // Why upright film: a camera with an image plane that looks a little up or down kept its
      // plane square to its axis, and the plane leaned (NeRF's posed views); a level film keeps
      // the plane's sides vertical, like a shift lens. `upright: false` tilts it with the camera.
      const level =
        spec.upright ?? (Boolean(spec.imagePlane) && Math.abs(forward[2]) < 0.6 && !spec.up)
      const up = level && spec.upright !== false ? [0, 0, 1] : unit(cross(right, forward))
      // A level camera's body sits level too: it looks along its heading, the lens shifted.
      const heading = up[2] === 1 ? unit([forward[0], forward[1], 0]) : forward
      const fov = spec.fov ?? 40
      const aspect = spec.aspect ?? 1
      const size = spec.size ?? 0.4
      const half = Math.tan((fov * Math.PI) / 360)
      const handle = { id, center, forward, right, up, fov, aspect }
      cameras[id] = handle
      anchor(id, center)
      const rectAt = (distance) => {
        const c = add(center, mul(forward, distance))
        const hw = half * distance * aspect
        const hh = half * distance
        return [
          add(add(c, mul(right, -hw)), mul(up, hh)),
          add(add(c, mul(right, hw)), mul(up, hh)),
          add(add(c, mul(right, hw)), mul(up, -hh)),
          add(add(c, mul(right, -hw)), mul(up, -hh))
        ]
      }
      const style = spec.style ?? 'pyramid'
      if (style === 'eye') {
        // Why a screen glyph: the centre of projection reads as an angle with an arc at any size.
        units.push({
          type: 'group',
          owner: id,
          center,
          points: [center],
          parts: (cam) => {
            const a = cam.project(center)
            const b = cam.project(add(center, mul(forward, size)))
            return a && b ? [{ kind: 'eye', at: a, toward: b, pt: spec.pt ?? 0.8 }] : []
          }
        })
      }
      const role = sceneRole(spec.role, style === 'body' ? 'ink' : 'neutral')
      if (style === 'body') {
        api.box({
          id: `${id}.body`,
          at: add(center, mul(heading, -size * 0.55)),
          size: [size * 0.9 * aspect, size * 1.1, size * 0.75],
          axes: [right, heading, up],
          role,
          tone: spec.tone ?? 10,
          edge: false
        })
      }
      const lensDepth = style === 'body' ? size * 0.5 : size
      const lens = rectAt(lensDepth)
      const lensAxis = add(center, mul(forward, lensDepth))
      for (let index = 0; index < 4 && style !== 'none' && style !== 'eye'; index += 1) {
        const a = lens[index]
        const b = lens[(index + 1) % 4]
        const raw = unit(cross(sub(a, center), sub(b, center)))
        // Why: each side of the lens faces out from its axis, whatever the corner order.
        const outward = dot(raw, sub(mul(add(a, b), 0.5), lensAxis)) < 0 ? mul(raw, -1) : raw
        units.push({
          type: 'face',
          owner: id,
          pts: [center, a, b],
          normal: outward,
          role: style === 'body' ? role : sceneRole(spec.fill, 'neutral'),
          tone: style === 'body' ? (spec.tone ?? 10) : 1,
          opacity: 1,
          shade: true,
          cull: true,
          solid: `${id}.lens`,
          edge: style === 'body' ? null : strokeOf(spec.edge, { role: 'ink', tone: 11, pt: 0.6 }),
          decals: [],
          fills: [],
          layer: 0
        })
      }
      units.push({
        type: style === 'none' || style === 'eye' ? 'skip' : 'face',
        owner: id,
        pts: lens,
        normal: forward,
        role: style === 'body' ? role : sceneRole(spec.fill, 'neutral'),
        tone: style === 'body' ? (spec.tone ?? 10) - 2 : 0,
        opacity: 1,
        shade: false,
        cull: true,
        solid: `${id}.lens`,
        edge: style === 'body' ? null : strokeOf(spec.edge, { role: 'ink', tone: 11, pt: 0.6 }),
        decals: [],
        fills: [],
        layer: 0
      })
      if (spec.frustum) {
        const far = spec.frustum.far ?? 3
        const ring = rectAt(far)
        const frole = sceneRole(spec.frustum.role, 'accent')
        for (let index = 0; index < 4; index += 1) {
          const a = ring[index]
          const b = ring[(index + 1) % 4]
          units.push({
            type: 'face',
            owner: `${id}.frustum`,
            pts: [center, a, b],
            normal: unit(cross(sub(a, center), sub(b, center))),
            role: frole,
            tone: spec.frustum.tone ?? 2,
            opacity: spec.frustum.opacity ?? 0.22,
            shade: false,
            edge: spec.frustum.edge ? strokeOf(spec.frustum.edge, { role: frole, pt: 0.4 }) : null,
            decals: [],
            fills: [],
            layer: 0,
            split: false
          })
        }
        anchor(`${id}.far`, add(center, mul(forward, far)))
      }
      if (spec.imagePlane) {
        const distance = spec.imagePlane.distance ?? size * 2
        const hh = half * distance
        api.plane({
          ...spec.imagePlane,
          id: spec.imagePlane.id ?? `${id}.image`,
          at: add(center, mul(forward, distance)),
          u: right,
          v: mul(up, -1),
          size: spec.imagePlane.size ?? [2 * hh * aspect, 2 * hh]
        })
      }
      handle.pixel = (s, t, distance = 1) => {
        const [tl, tr, , bl] = rectAt(distance)
        return add(add(tl, mul(sub(tr, tl), s)), mul(sub(bl, tl), t))
      }
      return handle
    },
    /**
     * A box: `at` its centre (or `min`), `size` [x, y, z], `axes` to turn it; solid faces lit
     * from the upper left (`fill: false` for none), `wire` 'solid' | 'dashed' | 'dotted' for its
     * twelve edges (a bounding box), `edge` the outline of each face.
     */
    box(spec = {}) {
      const id = spec.id ?? nextId('box')
      const size = Array.isArray(spec.size)
        ? spec.size
        : [spec.size ?? 1, spec.size ?? 1, spec.size ?? 1]
      const center = spec.min ? add(spec.min, mul(size, 0.5)) : (spec.at ?? [0, 0, 0])
      const [ax, ay, az] = spec.axes ?? [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1]
      ]
      const corner = (sx, sy, sz) =>
        add(
          add(add(center, mul(ax, (sx * size[0]) / 2)), mul(ay, (sy * size[1]) / 2)),
          mul(az, (sz * size[2]) / 2)
        )
      const v = [-1, 1].flatMap((sx) =>
        [-1, 1].flatMap((sy) => [-1, 1].map((sz) => corner(sx, sy, sz)))
      )
      // Index: (sx, sy, sz) with -1 → 0, 1 → 1, as sx*4 + sy*2 + sz.
      const faces = [
        { idx: [0, 2, 6, 4], n: mul(az, -1) },
        { idx: [1, 5, 7, 3], n: az },
        { idx: [0, 4, 5, 1], n: mul(ay, -1) },
        { idx: [2, 3, 7, 6], n: ay },
        { idx: [0, 1, 3, 2], n: mul(ax, -1) },
        { idx: [4, 6, 7, 5], n: ax }
      ]
      const role = sceneRole(spec.role, 'neutral')
      if (spec.fill !== false && !spec.wire) {
        for (const [index, face] of faces.entries()) {
          const pts = face.idx.map((k) => v[k])
          const side = spec.photos?.[BOX_SIDES[index]]
          const uvs = side ? planarUvs(pts, unit(face.n)) : null
          units.push({
            texture: side ? api.loadPhoto(side, null) : null,
            uvs,
            type: 'face',
            owner: id,
            pts,
            normal: unit(face.n),
            role,
            tone: spec.tone ?? 2,
            opacity: spec.opacity ?? 1,
            shade: spec.shade ?? true,
            cull: (spec.opacity ?? 1) >= 1,
            cast: spec.cast ?? (spec.opacity ?? 1) >= 0.5,
            sketch: spec.sketch ?? api.lookDefaults?.sketch ?? null,
            solid: id,
            edge: strokeOf(spec.edge, { role: 'ink', tone: 11, pt: 0.5 }),
            decals: [],
            fills: [],
            layer: spec.layer ?? 0,
            split: Boolean(spec.split),
            rect: !spec.axes
          })
        }
        records.solids += 1
      }
      if (spec.wire) {
        const stroke = strokeOf(typeof spec.wire === 'object' ? spec.wire : {}, {
          role: 'ink',
          tone: 9,
          pt: 0.55,
          dash:
            typeof spec.wire === 'string'
              ? spec.wire === 'solid'
                ? null
                : spec.wire
              : (spec.wire.dash ?? null)
        })
        const edges = [
          [0, 1],
          [2, 3],
          [4, 5],
          [6, 7],
          [0, 2],
          [1, 3],
          [4, 6],
          [5, 7],
          [0, 4],
          [1, 5],
          [2, 6],
          [3, 7]
        ]
        const sketch = spec.sketch ?? api.lookDefaults?.sketch ?? null
        for (const [a, b] of edges) {
          units.push({
            type: 'line',
            owner: id,
            pts: [v[a], v[b]],
            ...stroke,
            sketch,
            rect: !spec.axes
          })
        }
      }
      anchor(id, center)
      anchor(`${id}.top`, corner(0, 0, 1))
      anchor(`${id}.bottom`, corner(0, 0, -1))
      v.forEach((point, index) => anchor(`${id}.c${index}`, point))
      return { id, center, size, corners: v }
    }
  }
}
