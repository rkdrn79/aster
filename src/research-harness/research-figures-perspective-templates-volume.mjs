// The volume-boxes perspective template: a row of glass boxes (a 3D quantity each: a density, a
// colour, a shading) holding a picture or a cloud of splats, flat beams between them, a light
// whose beam enters the first box, and a camera body that renders the last one onto its image
// plane. A pipeline of 3D fields rendered by a camera, drawn as 3D; the labels stay native.
import { add, mul, sub, unit } from './research-figures-perspective-camera.mjs'

const asPhoto = (value) => (typeof value === 'string' ? { src: value } : value)
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
]

/** A wide flat arrow (a beam) from `from` to `to`, upright, as one mesh of two faces. */
function beam(b, id, from, to, width, role) {
  const d = sub(to, from)
  const w = mul(unit(cross(d, [0, 1, 0])), width / 2)
  const neck = add(from, mul(d, 0.72))
  b.mesh({
    id,
    vertices: [
      add(from, w),
      sub(from, w),
      sub(neck, w),
      add(neck, w),
      add(neck, mul(w, 1.9)),
      sub(neck, mul(w, 1.9)),
      to
    ],
    faces: [
      [0, 1, 2, 3],
      [5, 6, 4]
    ],
    role,
    tone: 3,
    opacity: 0.7,
    shade: false,
    outline: false,
    cast: false
  })
}

/** A soft cloud of splats standing in for a density: a few ellipsoids round the box centre. */
function cloud(b, id, at, role) {
  const spots = [
    [[-0.12, 0, -0.12], [0.16, 0.12, 0.11], 5],
    [[0.14, 0, -0.08], [0.13, 0.09, 0.1], 4],
    [[0.02, 0, 0.12], [0.12, 0.09, 0.09], 6],
    [[-0.2, 0, 0.16], [0.07, 0.05, 0.05], 3],
    [[0.24, 0, 0.18], [0.08, 0.05, 0.06], 3]
  ]
  spots.forEach(([offset, radii, tone], k) => {
    b.gaussian({
      id: `${id}.s${k}`,
      at: add(at, offset),
      radii,
      axis: [1, 0, 0.2],
      role,
      tone,
      levels: 3,
      opacity: 0.7
    })
  })
}

export function volumeBoxes(b, o) {
  const count = o.count ?? o.photos?.length ?? 3
  const pitch = o.pitch ?? 1.6
  const photos = o.photos ?? []
  const anchors = {}
  const centres = Array.from({ length: count }, (_, k) => [(k - (count - 1) / 2) * pitch, 0, 0])
  centres.forEach((at, k) => {
    const id = `box${k + 1}`
    b.box({ id, at, size: [1, 1, 1], wire: { role: 'ink', tone: 7, pt: 0.5 } })
    const photo = photos[k]
    if (photo) {
      b.plane({
        id: `${id}.img`,
        at: add(at, [0, 0.05, 0]),
        axes: 'xz',
        size: [0.94, 0.94],
        photo: asPhoto(photo),
        role: 'none',
        edge: false
      })
    } else {
      cloud(b, `${id}.cloud`, at, o.cloudRole ?? 'accent')
    }
    anchors[id] = at
    anchors[`${id}.top`] = add(at, [0, -0.5, 0.5])
    anchors[`${id}.bottom`] = add(at, [0, -0.5, -0.5])
    if (k > 0 && o.beams !== false) {
      beam(
        b,
        `beam${k}`,
        add(centres[k - 1], [0.6, 0, 0.3]),
        add(at, [-0.6, 0, 0.3]),
        0.24,
        o.beamRole ?? 'neutral'
      )
    }
  })
  const first = centres[0]
  const last = centres.at(-1)
  if (o.light !== false) {
    const sun = add(first, [-1.6, 0, 0.3])
    b.light({ id: 'sun', at: sun, dir: [-0.7, -0.4, 0.6], r: 5 })
    beam(
      b,
      'sunbeam',
      add(sun, [0.3, 0, 0]),
      add(first, [-0.6, 0, 0.3]),
      0.3,
      o.lightRole ?? 'second'
    )
    anchors.sun = sun
  }
  if (o.camera !== false) {
    const cam = add(last, [1.3, -0.75, -0.42])
    b.camera({
      id: 'cam',
      at: cam,
      lookAt: last,
      fov: 24,
      size: 0.13,
      style: 'body',
      role: 'ink',
      frustum: {
        far: 1.35,
        role: 'neutral',
        opacity: 0.07,
        edge: { role: 'ink', tone: 6, pt: 0.4 }
      },
      // Why a larger plane than a rig's: the render it makes is the result, so it must read.
      imagePlane: {
        distance: 0.55,
        size: o.renderSize ?? [0.68, 0.68],
        ...(o.render ? { photo: asPhoto(o.render) } : {}),
        edge: { pt: 0.6 }
      }
    })
    anchors.cam = cam
  }
  return { anchors }
}
