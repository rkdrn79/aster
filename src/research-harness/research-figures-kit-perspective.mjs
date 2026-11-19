// fig.perspective: a 3D scene seen through one camera (a true pinhole, or an oblique, iso, front
// or top view), drawn from primitives or a template and placed as one vector image that repaints
// with the figure's palette. Labels stay native: the scene returns anchors and point([x, y, z])
// in figure coordinates, and `labels` places text or math beside them.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { figureElement, PAGE_FRAME_ID } from './research-figures-model.mjs'
import { imageMimeType, imageSize } from './research-figures-image.mjs'
import { photoKind } from './research-figures-photos.mjs'
import {
  ILLUSTRATION_STYLES,
  illustrationPalette,
  paintIllustrationSvg
} from './research-figures-illustration-paint.mjs'
import {
  CAMERA_KINDS,
  boundingSphere,
  cross,
  length,
  makeCamera,
  sub
} from './research-figures-perspective-camera.mjs'
import { perspectiveScene } from './research-figures-perspective-scene.mjs'
import { renderPerspective } from './research-figures-perspective-render.mjs'
import { PERSPECTIVE_TEMPLATES } from './research-figures-perspective-templates.mjs'
import {
  rowBoxes,
  rowGaps,
  sceneFill,
  stageArrows,
  turnToFit
} from './research-figures-kit-perspective-row.mjs'
import { tidyCamera, viewCamera } from './research-figures-perspective-views.mjs'
import { warnKit } from './research-figures-cards.mjs'

const r2 = (value) => Math.round(value * 100) / 100
/** Look of a figure's illustrations when nobody chose one, by colour preset. */
const PRESET_LOOK = { outline: 'line', 'print-mono': 'mono' }

/** Photo loader for scenes: project images (src), stock photos (kind), each read once. */
function photoLoader(project) {
  const cache = new Map()
  return {
    load(spec) {
      let file
      if (spec.kind) {
        const kind = photoKind(spec.kind)
        if (!kind) {
          throw new Error(`no stock photo "${spec.kind}"; \`figures kit image\` lists the kinds`)
        }
        file = fileURLPath(`vendor/photos/hd/${kind}.jpg`)
      } else if (spec.src) {
        file = path.isAbsolute(spec.src) ? spec.src : path.join(project ?? '.', spec.src)
        if (!existsSync(file)) {
          throw new Error(
            `no picture ${spec.src}: a photo's src is relative to the project folder ${project ?? '.'} (here ${file}), not to the script; write it as data/<figure>/<file>`
          )
        }
      } else {
        throw new Error('a photo on a plane needs src (a project image) or kind (a stock photo)')
      }
      if (!cache.has(file)) {
        const bytes = readFileSync(file)
        const size = imageSize(bytes)
        if (!size) {
          throw new Error(`${spec.src ?? spec.kind} is not a PNG or JPEG image`)
        }
        cache.set(file, {
          key: file,
          href: `data:${imageMimeType(file)};base64,${bytes.toString('base64')}`,
          ...size
        })
      }
      return cache.get(file)
    }
  }
}

function fileURLPath(relative) {
  return decodeURIComponent(new URL(relative, import.meta.url).pathname)
}

/** Pairs of rays that leave different points in the same direction (parallel, not converging). */
export function parallelRayPairs(rays) {
  const pairs = []
  for (let i = 0; i < rays.length; i += 1) {
    for (let j = i + 1; j < rays.length; j += 1) {
      const [a, b] = [rays[i], rays[j]]
      const apart = length(sub(a.origin, b.origin))
      if (apart > 1e-6 && length(cross(a.direction, b.direction)) < 0.03) {
        pairs.push([a.id, b.id])
      }
    }
  }
  return pairs
}

/**
 * The side of a point facing away from the scene's middle (`outside`), so a plane's name or a
 * vertex number sits off the drawing rather than over it.
 */
function outsideSide([px, py], [cx, cy]) {
  const [dx, dy] = [px - cx, py - cy]
  if (Math.abs(dx) > Math.abs(dy) * 1.6) {
    return dx < 0 ? 'left' : 'right'
  }
  if (Math.abs(dy) > Math.abs(dx) * 1.6) {
    return dy < 0 ? 'above' : 'below'
  }
  return `${dy < 0 ? 'above' : 'below'}-${dx < 0 ? 'left' : 'right'}`
}

/** Placing a label beside a point: its box's top-left for a side and a gap. */
function besidePoint([px, py], { width, height }, side = 'right', gap = 4) {
  const horizontal = side.includes('left')
    ? -gap - width
    : side.includes('right')
      ? gap
      : -width / 2
  const vertical = side.includes('above')
    ? -gap - height
    : side.includes('below')
      ? gap
      : -height / 2
  return [px + horizontal, py + vertical]
}

/**
 * The camera a scene asks for, tidied: `view` (a named view) or `camera` (a view name, a kind,
 * a scene id, or angles snapped to tidy values); the notes on odd angles print as kit warnings.
 */
function askedCamera(spec, owner) {
  if (spec.view !== undefined && !viewCamera(spec.view)) {
    throw new Error(
      `${owner}: view "${spec.view}" is not one of three-quarter, side, front, top-oblique`
    )
  }
  const given = spec.view
    ? { view: spec.view, ...(typeof spec.camera === 'object' ? spec.camera : {}) }
    : spec.camera
  const { camera, notes } = tidyCamera(given, owner)
  warnKit(notes)
  return camera
}

/**
 * Scenes grouped by the row they sit in (the same box top and height): each row's screen span
 * through the shared camera (`spanOf`), its widest margin (`padOf`), and the baseline that
 * centres the row's union in its boxes (`baselineOf`: the page y of screen y 0).
 */
function rowsOf(boxes, contents) {
  const key = (index) => `${boxes[index].y ?? 0}|${boxes[index].h ?? 0}`
  const groups = new Map()
  contents.forEach((content, index) => {
    const group = groups.get(key(index)) ?? { y0: Infinity, y1: -Infinity, pad: 0 }
    group.y0 = Math.min(group.y0, content.y0)
    group.y1 = Math.max(group.y1, content.y1)
    group.pad = Math.max(group.pad, content.pad)
    groups.set(key(index), group)
  })
  const of = (index) => groups.get(key(index))
  return {
    spanOf: (index) => Math.max(of(index).y1 - of(index).y0, 1e-9),
    padOf: (index) => of(index).pad,
    baselineOf(index, box, scale) {
      const { y0, y1 } = of(index)
      return r2((box.y ?? 0) + (box.h - (y1 - y0) * scale) / 2 - y0 * scale)
    }
  }
}

export function perspectiveMethods(core, context) {
  const pageFrame = () => core.elements.find((element) => element.id === PAGE_FRAME_ID)
  const sceneRecord = (id) => {
    const element = core.elements.find(
      (entry) => entry.id === id && !entry.isDeleted && entry.customData?.asterPerspective
    )
    if (!element) {
      throw new Error(`no perspective scene "${id}" to share a camera or scale with; draw it first`)
    }
    return element.customData.asterPerspective
  }
  /** A scene's units from its draw or template, with the template's camera and anchors. */
  const buildScene = (spec) => {
    const { project } = context()
    const b = perspectiveScene({ photos: photoLoader(project) })
    if (!spec.template) {
      spec.draw(b)
      return { b, templateCamera: null, templateAnchors: {}, templateLabels: [], turn: null }
    }
    const template = PERSPECTIVE_TEMPLATES[spec.template]
    if (!template) {
      throw new Error(
        `no perspective template "${spec.template}"; templates: ${Object.keys(PERSPECTIVE_TEMPLATES).join(', ')}`
      )
    }
    const made = template.draw(b, spec.options ?? {}) ?? {}
    // Why a function: a template's camera may follow its options (hash-grid dims 2 looks flat).
    const templateCamera =
      typeof template.camera === 'function' ? template.camera(spec.options ?? {}) : template.camera
    return {
      b,
      templateCamera,
      templateAnchors: made.anchors ?? {},
      templateLabels: made.labels ?? [],
      // Why a list: a template may turn further one way than the other (Mip-NeRF's cone turns
      // toward the front in a tall panel, never toward edge-on); true is one 5° step either way.
      turn: Array.isArray(template.turn) ? template.turn : template.turn === true ? [5, -5] : null
    }
  }
  const methods = {
    /**
     * A perspective scene: `camera` ({ eye, at, fov } | { azimuth, elevation, distance, fov } |
     * { kind: 'oblique' | 'iso' | 'ortho' | 'front' | 'top' } | another scene's id), `draw: (b) =>
     * …` with the primitives or `template` + `options`; `like` shares another scene's camera and
     * scale. Returns its box, `anchors` and `point([x, y, z])` in figure units.
     */
    perspective(spec) {
      if (!spec?.id) {
        throw new Error('perspective({ id, x, y, w | h, camera, draw | template }) needs an id')
      }
      const sources = ['draw', 'template'].filter((key) => spec[key] !== undefined)
      if (sources.length !== 1) {
        throw new Error(`perspective ${spec.id} takes exactly one of draw or template`)
      }
      const { fig } = context()
      // Why reuse: fig.perspectives built the scene to fit it; building it again warned twice.
      const { b, templateCamera, templateAnchors, templateLabels, turn } =
        spec.built ?? buildScene(spec)
      const shared = spec.like ? sceneRecord(spec.like) : null
      const asked = spec.fixedCamera ? spec.camera : askedCamera(spec, spec.id)
      // Why turned: a long cone or a tri-plane in a wide, short box fitted by its height alone.
      const fitted =
        turn && !asked && !shared && spec.w && spec.h
          ? turnToFit([b.units], templateCamera, { boxes: [{ w: spec.w, h: spec.h }] }, turn)
          : templateCamera
      const cameraSpec =
        typeof asked === 'string' && !CAMERA_KINDS.includes(asked)
          ? sceneRecord(asked).cameraSpec
          : (asked ?? shared?.cameraSpec ?? fitted ?? {})
      const scale =
        typeof spec.scale === 'number'
          ? spec.scale
          : typeof spec.scale === 'string'
            ? sceneRecord(spec.scale).scale
            : (shared?.scale ?? null)
      const style = core.styled({}).style
      const recorded = pageFrame()?.customData?.asterPage?.illustration ?? {}
      // Why 'line' by default: its fills sit a tone lighter under ink edges, so cones, boxes and
      // Gaussians print as soft lit solids rather than dark flat blots (round 14 judges); a look
      // the figure set (fig.illustrationStyle) or `look: 'flat'` on the scene wins.
      const look = spec.look ?? recorded.look ?? PRESET_LOOK[style.name] ?? 'line'
      const rendered = renderPerspective(b.units, {
        camera: cameraSpec,
        box: { w: spec.w, h: spec.h },
        scale: scale ?? undefined,
        lookPt: ILLUSTRATION_STYLES[look]?.strokePt ?? 0.6,
        look,
        idPrefix: spec.id.replace(/[^a-zA-Z0-9-]/g, '-')
      })
      const svg = paintIllustrationSvg(
        rendered.svg,
        illustrationPalette(style, { roles: spec.roles }),
        { look }
      )
      const { width, height } = rendered.size
      // Why the shared box too: a scene `like` another without its own w and h sat at its x, y
      // corner while the first was centred in its box, so (a) and (b) did not line up.
      const boxW = spec.w ?? (spec.h ? undefined : shared?.box?.w)
      const boxH = spec.h ?? (spec.w ? undefined : shared?.box?.h)
      // Why centred even at a shared scale: panels a, b, c sit in their boxes, not at the corner.
      const x = (spec.x ?? 0) + (boxW ? (boxW - width) / 2 : 0)
      let y = (spec.y ?? 0) + (boxH ? (boxH - height) / 2 : 0)
      // Why a baseline: scenes through one camera at one scale in one row sit so the same world
      // height prints at the same page height, and o, the image planes and the floors line up.
      const { content } = rendered
      const level =
        spec.baseline ??
        (shared?.baseline !== undefined &&
        shared.boxY === (spec.y ?? 0) &&
        (boxH === undefined || shared.box?.h === boxH)
          ? shared.baseline
          : null)
      if (level !== null && level !== undefined) {
        const aligned = level + content.y0 * rendered.scale - content.pad
        const top = spec.y ?? 0
        const inside = !boxH || (aligned >= top - 2 && aligned + height <= top + boxH + 2)
        y = spec.baseline !== undefined || inside ? aligned : y
      }
      const cam = rendered.camera
      // Why straight lines too: a wire cube or a voxel lattice converges like any plane does.
      const straight = b.units.filter((unit) => unit.type === 'line' && unit.pts.length === 2)
      const cues = [
        !cam.parallel &&
        (b.records.planes + b.records.solids + b.records.floors > 0 || straight.length >= 4)
          ? 'convergence'
          : null,
        rendered.occlusions > 0 ? 'occlusion' : null,
        b.records.solids > 0 ? 'shading' : null,
        rendered.depthRatio > 1.2 ? 'line weight' : null,
        b.records.floors > 0 ? 'floor' : null,
        // Why a cue of its own: a solid casting its shadow on the floor anchors it in depth.
        b.records.floors > 0 &&
        b.records.solids > 0 &&
        !b.units.some((unit) => unit.type === 'light' && !unit.shadows)
          ? 'shadow'
          : null
      ].filter(Boolean)
      const { fileId } = core.files.embed('aster-ill-', svg)
      const element = figureElement('image', {
        id: spec.id,
        x: r2(x),
        y: r2(y),
        width: r2(width),
        height: r2(height),
        fileId,
        status: 'saved',
        scale: [1, 1],
        crop: null,
        strokeColor: 'transparent',
        boundElements: [],
        frameId: spec.frame ?? null,
        groupIds: spec.groupIds ?? [],
        customData: {
          asterIllustration: {
            source: 'perspective',
            name: spec.template ?? null,
            look,
            view: cam.kind,
            light: 'left',
            skin: recorded.skin ?? 'light',
            roles: spec.roles ?? {},
            projection: cam.kind
          },
          asterPerspective: {
            id: spec.id,
            template: spec.template ?? null,
            camera: cam.record(),
            cameraSpec: cam.spec(),
            scale: rendered.scale,
            box: { w: boxW ?? null, h: boxH ?? null },
            boxY: spec.y ?? 0,
            baseline: r2(y + content.pad - content.y0 * rendered.scale),
            fill: sceneFill(rendered.drawn, boxW, boxH),
            verticals: rendered.verticals,
            width: r2(width),
            height: r2(height),
            cues,
            photos: rendered.photos.map(({ id, width: w, height: h }) => ({
              id,
              width: w,
              height: h
            })),
            parallelRays: cam.parallel ? [] : parallelRayPairs(b.records.rays),
            rays: b.records.rays.length,
            ...(spec.like || spec.linked ? { like: spec.like ?? spec.linked } : {})
          }
        }
      })
      core.add([element], spec.id)
      const point = (world) => {
        const local = rendered.toFigure(world)
        return local ? [r2(x + local[0]), r2(y + local[1])] : null
      }
      const anchors = {}
      for (const [name, world] of Object.entries({ ...b.anchors, ...templateAnchors })) {
        const at = point(world)
        if (at) {
          anchors[name] = at
        }
      }
      const placed = []
      const middle = [x + width / 2, y + height / 2]
      const labels = [
        ...templateLabels.map((label, index) => ({ id: `${spec.id}-tlabel-${index}`, ...label })),
        ...(spec.labels ?? []).map((label, index) => ({
          id: `${spec.id}-label-${index}`,
          ...label
        }))
      ]
      for (const [index, label] of labels.entries()) {
        const at = typeof label.at === 'string' ? anchors[label.at] : point(label.at)
        if (!at) {
          throw new Error(
            `label ${index} of ${spec.id}: no anchor "${label.at}"; its anchors: ${Object.keys(anchors).join(', ')}`
          )
        }
        const { id } = label
        if (label.tex) {
          fig.math({ id, tex: label.tex, x: 0, y: 0, size: label.size, color: label.color })
        } else {
          fig.text({ id, text: label.text, x: 0, y: 0, size: label.size, color: label.color })
        }
        const box = fig.bounds(id)
        const side = (label.side ?? 'right') === 'outside' ? outsideSide(at, middle) : label.side
        const [bx, by] = besidePoint(at, box, side, label.gap ?? 4)
        // Why kept on the page: an 'outside' label beside a plane at the scene's edge went past
        // the page; it slides along that edge to stay 12 units inside.
        const frame = pageFrame()
        const [lx, ly] = frame
          ? [
              Math.max(frame.x + 12, Math.min(bx, frame.x + frame.width - 12 - box.width)),
              Math.max(frame.y + 12, Math.min(by, frame.y + frame.height - 12 - box.height))
            ]
          : [bx, by]
        fig.move(id, r2(lx - box.x), r2(ly - box.y))
        placed.push(id)
      }
      return {
        element,
        id: spec.id,
        x: r2(x),
        y: r2(y),
        width: r2(width),
        height: r2(height),
        right: r2(x + width),
        bottom: r2(y + height),
        anchors,
        point,
        labels: placed,
        camera: cam.record(),
        cues
      }
    }
  }
  /**
   * Several scenes through one camera at one scale (Mip-NeRF's ray, cone and Gaussians; NeRF's
   * two views): `scenes` [{ id, x, y, w, h, draw | template, options, labels, roles }] and one
   * `camera`. The camera is fitted to all of them together, the scale is the largest at which
   * every scene fits its own box, and each is centred in its box. Scenes without boxes are laid
   * out in a row inside the call's own `x, y, w, h`; `arrows` [{ from, to, label }] join stages.
   * Returns { scenes, scale, camera, arrows }.
   */
  methods.perspectives = (spec) => {
    const scenes = spec?.scenes ?? []
    if (!scenes.length || scenes.some((scene) => !scene?.id)) {
      throw new Error(
        'perspectives({ camera, scenes: [{ id, x, y, w, h, draw | template }] }) needs scenes with ids'
      )
    }
    const built = scenes.map((scene) => buildScene(scene))
    const boxed = scenes.every((scene) => scene.w || scene.h)
    const asked = askedCamera(spec, 'perspectives')
    const chosen = asked ?? built.find((entry) => entry.templateCamera)?.templateCamera ?? {}
    const given =
      !asked && built.some((entry) => entry.turn)
        ? turnToFit(
            built.map(({ b }) => b.units),
            chosen,
            boxed
              ? { boxes: scenes }
              : { row: { w: spec.w, h: spec.h, gaps: rowGaps(spec, scenes) } },
            built.find((entry) => entry.turn).turn
          )
        : chosen
    const points = built.flatMap(({ b }) =>
      b.units.flatMap((unit) => unit.pts ?? (unit.at ? [unit.at] : (unit.points ?? [])))
    )
    const camera = makeCamera(given, boundingSphere(points)).spec()
    const contents = built.map(({ b }) => renderPerspective(b.units, { camera, scale: 1 }).content)
    // Why one height per row: scenes that sit on one baseline need the row's whole height.
    const rows = rowsOf(boxed ? scenes : scenes.map(() => ({ y: 0, h: 0 })), contents)
    let laid = scenes
    let scale
    if (boxed) {
      scale = Math.min(
        ...scenes.map((scene, index) => {
          const { pad, width } = contents[index]
          const span = rows.spanOf(index)
          return Math.min(
            scene.w ? (scene.w - 2 * pad) / width : Infinity,
            scene.h ? (scene.h - 2 * rows.padOf(index)) / span : Infinity
          )
        })
      )
    } else {
      const row = rowBoxes(
        spec,
        scenes,
        contents.map((content, index) => ({ ...content, height: rows.spanOf(index) }))
      )
      scale = row.scale
      laid = scenes.map((scene, index) => ({ ...scene, ...row.boxes[index] }))
    }
    const placed = laid.map((scene, index) =>
      methods.perspective({
        ...scene,
        built: built[index],
        camera,
        fixedCamera: true,
        scale,
        ...(scene.h ? { baseline: rows.baselineOf(index, scene, scale) } : {}),
        ...(index > 0 ? { linked: scenes[0].id } : {})
      })
    )
    const { fig } = context()
    const arrows = stageArrows(fig, placed, spec.arrows)
    return { scenes: placed, scale, camera: placed[0].camera, arrows }
  }
  return methods
}
