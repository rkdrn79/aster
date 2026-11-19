// Perspective templates: the 3D structures AI papers draw again and again, each a whole scene
// with a sensible camera, built from the primitives so every part stays an option. They take
// the paper's own photos where it has them; labels stay native (the anchors each returns, and
// `labels` it places beside them). The drawings live in -rays (NeRF, Mip-NeRF) and -grids.
import { AZIMUTH_NOTE, mipCone, nerfRays } from './research-figures-perspective-templates-rays.mjs'
import { volumeBoxes } from './research-figures-perspective-templates-volume.mjs'
import { VIEW_PRESETS } from './research-figures-perspective-views.mjs'
import {
  cameraRig,
  hashGrid,
  swinWindows,
  triplane
} from './research-figures-perspective-templates-grids.mjs'

export { AZIMUTH_NOTE } from './research-figures-perspective-templates-rays.mjs'

/**
 * Option lists for `figures kit perspective`: [name, default, meaning]; `anchors` names what
 * the scene returns in `anchors` (figure units) for labels and arrows. `camera` is the default
 * view (a function of the options when they change it).
 */
export const PERSPECTIVE_TEMPLATES = {
  'nerf-rays': {
    does: 'NeRF-style: a dotted scene box with the object photo inside (faded, painted under the rays so every sample stays in front), two posed image planes with their photos, a ray from each camera through a pixel off the centre (so the two rays cross the box at different heights and angles), samples along each inside the box. Sized for a panel 200–330 units wide: the photo planes print 0.6 in or more there; in a narrower panel show fewer parts or the photos flat beside it.',
    anchors:
      'ray1.s1 … ray1.s7 (samples), ray1.start, ray1.through (the pixel), ray1.end, ray1.middle, ray1; view1 (plane centre), view1.tl | tr | br | bl, view1.pixel; cam1 (centre of projection); box, box.top, box.bottom, box.c0 … c7; scene (photo centre); top; center (likewise ray2, view2, cam2)',
    camera: { azimuth: -100, elevation: 15, fov: 30 },
    options: [
      [
        'scene',
        '—',
        'the object photo floated in the box (faded 0.42): a path, { src | kind, opacity, crop }'
      ],
      ['views', '[]', 'photos on the two image planes, one per pose'],
      ['samples', '7', 'sample points per ray'],
      [
        'sampleSize',
        '1.8',
        'sample dot radius in printed pt (coloured ones 1.25×); per ray [r1, r2] or per sample [[…], […]] (radius = σ)'
      ],
      ['sampleStyle', "'filled'", "'open' rings for the network's outputs (panel b)"],
      [
        'sampleRoles',
        '[]',
        "per ray, a role or #hex per sample ([[null, null, 'accent', …], […]])"
      ],
      [
        'sampleColors',
        '[]',
        'per ray, a #hex (or role) per sample: the predicted colour of each point'
      ],
      [
        'samplesInFront',
        'true',
        'false: the scene photo hides what is behind it, as a solid plane'
      ],
      ['rayRole', "'accent'", 'the rays’ colour role (or #hex)'],
      ['rayRoles', '—', "one role or #hex per ray: ['accent', 'b'] tells ray 1 from ray 2"],
      ['box', "'dotted'", "the scene box: 'dotted' | 'dashed' | false"],
      [
        'boxSize',
        '[2.3, 2.3, 1.15]',
        'the scene box in world units (the scene is fitted to w × h)'
      ],
      [
        'planeSize',
        '[1.25, 1.45]',
        'each image plane [w, h]; larger planes print the photos larger'
      ],
      ['pixels', '—', 'n: a pixel grid of n × n on each image plane'],
      [
        'poses',
        '[{ azimuth: -140, elevation: 0, pixel: [0.42, 0.64] }, { azimuth: -55, elevation: 0, pixel: [0.6, 0.34] }]',
        `the cameras, one entry each: azimuth, elevation (${AZIMUTH_NOTE}); distance 3.9 from the centre; plane (distance of its image plane from the camera, 2.15); pixel [s, t] the pixel the ray goes through (shares of the plane, from its top-left); length 2.7 (how far the ray runs past the pixel); at / lookAt to place it by hand. The viewer sits at -100: keep each pose 35–60° to one side of it (a pose near -100 stands between the viewer and the scene and its plane hides it; poses beyond 0 or -180 turn their planes' backs to you)`
      ],
      ['stub', '0.4', 'how far each ray starts before its pixel (world units)'],
      [
        'viewer',
        '{ azimuth: -100, elevation: 15 }',
        'where the scene photo faces: the camera you view the scene with'
      ],
      ['cameras', 'false', 'true: a wire pyramid at each centre of projection'],
      ['heads', "'end'", "ray arrowheads: 'end' | 'both' | 'none'"]
    ],
    draw: nerfRays
  },
  'mip-cone': {
    does: "Mip-NeRF-style: a camera at o, a pixel grid, and through its centre pixel a ray with samples (mode 'ray'), a cone cut into conical frustums with the one between t0 and t1 highlighted and the footprint's radius drawn on the pixel ('cone'), or one Gaussian per frustum along a dashed cone ('gaussians'). A ray-vs-cone story is three scenes in one fig.perspectives row, 'ray' | 'cone' → 𝒩 → 'gaussians', with arrows: [{ from: 'cone', to: 'gauss', label: '$\\mathcal{N}$' }] (figures kit examples ray-cone): the step from frustum to Gaussian is the point, so never draw the Gaussians inside the cone for it (mode 'cone+gaussians' prints a kit warning unless inside: true). labels: true names o, d, x, ṙ, t0, t1 clear of the drawing (or a map of TeX: { x: '\\mathbf{o}+t\\mathbf{d}' }). Every mode fills one fixed volume, so the scenes have one size and line up.",
    anchors:
      'o (the camera centre), d (on the near ray), pixel; ray mode: x (the labelled sample), x1, x2; cone and gaussians: t0, t1 (just under the cuts that bound the highlighted frustum: label them side below-right), rdot (the footprint rim) and rdot.label (the plane edge beside it, side left), top (over the far end), g1 … g3 (Gaussian centres: start an encoding arrow at g2); end',
    // Why side: from the three-quarter view the cone ran toward the viewer and printed short
    // on a 1.1 in page; from the side it reads long, the image plane still turned to show its grid.
    camera: VIEW_PRESETS.side.camera,
    // Why toward the front only: a tall panel takes the cone turned toward the three-quarter
    // view (up to 20°); turned the other way its upright image plane went edge-on.
    turn: [-5, -10, -15, -20],
    options: [
      [
        'mode',
        "'cone'",
        "'ray' | 'cone' | 'gaussians'; one per scene for the stages ('cone+gaussians' or a list puts Gaussians inside a translucent cone: only with inside: true, when the approximation step is not the story)"
      ],
      [
        'gaussians',
        '—',
        "true adds Gaussians to a cone; 'all' one per frustum instead of the highlighted one"
      ],
      ['grid', '3', 'pixels per side of the image plane'],
      ['angle', '9', 'the cone’s half-angle (degrees): the pixel footprint'],
      [
        'slices',
        '[2.35, 3.18]',
        't0 and t1 along the axis in world units from o (the image plane is at 1.35, the cone ends at length 4.3)'
      ],
      [
        'labels',
        'false',
        'true: o, d, x, ṙ, t0, t1 placed clear of the drawing; or { name: TeX | false }'
      ],
      ['radius', 'true', 'cone mode: the footprint radius drawn on the pixel (false: none)'],
      [
        'samples',
        '[0.5, 0.84]',
        'ray mode: sample shares of the ray measured from o (the image plane sits near 0.31), kept short of the arrowhead; hero 0.67 the labelled one (x)'
      ],
      [
        'camera',
        "'dot'",
        "the centre of projection o: 'dot', 'eye' (an angle glyph), 'pyramid' or false"
      ],
      ['sampleSize', '2.6', 'ray mode: the labelled sample’s radius in pt (the others 0.8×)'],
      ['footprint', 'from the angle', 'the footprint disc’s radius on the pixel (world units)'],
      [
        'role',
        "'accent'",
        'the cone and samples; gaussianRole, sampleRole, footprintRole for each part; sampleColors [role | #hex per sample], heroColor (x), gaussianColors [one per frustum]'
      ],
      ['length', '4.3', 'how far the ray or cone runs from o']
    ],
    draw: mipCone
  },
  triplane: {
    does: 'EG3D-style tri-plane: three axis-aligned feature planes through one centre (layout cross) or on the walls of a corner, gridded, with a query point and dashed projections to its feature on each plane. labels names the planes natively at their outer edges; point: false draws the planes alone.',
    anchors:
      'xy, xz, yz (where the query point projects onto each plane: start arrows there; the label spot when there is no point), xy.label, xz.label, yz.label (an outer edge of each plane), point; tri.xy, tri.xz, tri.yz and tri.xy.corner …',
    // Why the oblique: EG3D draws its planes square-on with depth at one slant, and a cross of
    // planes in perspective read tall and narrow in a short panel.
    camera: VIEW_PRESETS['top-oblique'].camera,
    options: [
      ['layout', "'cross'", "'cross' | 'corner'"],
      ['grid', '8', 'grid cells per side'],
      ['role', "'third'", 'the planes’ colour role (roles: { xy, xz, yz } one each)'],
      [
        'point',
        '[0.42, -0.38, 0.32]',
        'the query point in world units (the planes span ±1); false: none'
      ],
      [
        'labels',
        '—',
        "{ xy: 'F_{xy}', xz: …, yz: … } (TeX when it has \\, _ or ^; or { text | tex, side, size })"
      ],
      ['photos', '—', '{ xy, xz, yz } feature images on the planes']
    ],
    draw: triplane
  },
  'camera-rig': {
    does: 'A multi-view rig: the object (its photo, sized to the photo’s own aspect, or a sphere) in a dotted box, solid camera glyphs around it with view frustums. The photo prints 0.6 in or more in a panel 180 units tall.',
    anchors:
      'cam1 … (each camera centre), cam1.label … (just past the camera body, for its name: side outside), top, bottom (of the box), object, box.c0 … c7',
    camera: VIEW_PRESETS.front.camera,
    options: [
      ['object', '—', 'the object photo (path or { src | kind, crop })'],
      [
        'cameras',
        '4 spots',
        `[{ azimuth, elevation, distance, reach }] (${AZIMUTH_NOTE}; the viewer is at -90, so keep cameras off -90 or they cover the object)`
      ],
      ['cameraSize', 'from the object', 'the camera bodies’ size (world units)'],
      ['frustumRole', "'accent'", 'the view cones’ role (frustum: false hides them)']
    ],
    draw: cameraRig
  },
  swin: {
    does: 'Swin-style hierarchical windows: three oblique feature maps stacked, patches merging upward and windows (in colour) shrinking in number; vit: true gives three equal single-window maps. Share one camera and scale between a Swin and a ViT panel with like. The anchors are the same as a custom b.patchGrid named level1…: label the maps at level1.right (4×, 8×, 16×).',
    anchors:
      'level1 … level3 (map centres), level1.right | left | top | bottom (edge middles), level1.tl | tr | br | bl; top (the top map’s back edge)',
    camera: VIEW_PRESETS['top-oblique'].camera,
    options: [
      ['levels', '16/4, 8/2, 4/1', '[{ patches, windows, gap }] per side, bottom first'],
      ['photo', '—', 'the picture on every map, washed 0.35 so the lines read ({ src, wash })'],
      ['patchGap', '0', 'a gap between every patch: separate tokens (a ViT patch view)'],
      ['vit', 'false', 'the ViT baseline: one window per map'],
      ['role', "'bad'", 'the window colour'],
      ['windowPt', '0.8', 'window line weight (pt)'],
      ['patchRole', "'white' on a photo, else 'ink'", 'patch line colour'],
      ['patchPt', '0.5 (0.4 on dense maps)', 'patch line weight (pt)'],
      ['size', '2', 'each map’s side (world units)'],
      ['spacing', '1.05', 'height between maps: lower makes the maps larger in a short panel'],
      [
        'camera',
        "view 'top-oblique' ({ kind: 'oblique', angle: 40, depth: 0.55 })",
        'angle turns the maps, depth flattens them (0.4–0.7); keep the view of the other panels'
      ]
    ],
    draw: swinWindows
  },
  'hash-grid': {
    does: 'Instant-NGP-style multiresolution grid: two voxel lattices (levels) around a point x, the enclosing voxel of each in its colour with its corner vertices as rings. dims: 2 draws it flat over a photo, as the paper’s 2D figure, seen from the front. numbers: true writes each vertex’s number beside its ring (native text).',
    anchors:
      'x; l0.v0 … (vertex rings of level 0: four in 2D, eight in 3D), l1.v0 …, l0.cell, l1.cell; dims 2: domain, domain.left | right | top | bottom (edge middles), domain.tl …; dims 3: domain.c0 … c7, domain.top',
    camera: (options) => (options.dims === 2 ? 'front' : VIEW_PRESETS['three-quarter'].camera),
    options: [
      ['dims', '3', '3 (voxels) or 2 (a flat domain, seen from the front)'],
      ['levels', '[2, 3]', 'cells per side at each level'],
      [
        'level',
        'all',
        'one index of levels: only that level, in its colour and numbering (one scene per level, a row each, scenes like the first)'
      ],
      ['roles', "['bad', 'third']", 'one colour per level'],
      [
        'point',
        '[0.56, 0.38, 0.6] | 2D [0.62, 0.38]',
        'x as shares of the domain: [x, y, z]; dims 2 [x, y] with y up'
      ],
      [
        'numbers',
        'false',
        'true: 0, 1, 2 … beside each level’s vertices; or a list per level ([[0, 1, 2, 3], [4, 5, 6, 7]])'
      ],
      ['photo', '—', 'dims 2: the picture under the grid']
    ],
    draw: hashGrid
  },
  'volume-boxes': {
    does: 'A pipeline of 3D fields rendered by a camera: a row of glass boxes (every edge thin), each holding a picture standing in it (photos) or a soft cloud of splats (a density), flat beams between them, a sun whose beam enters the first box (b.light, so the scene shades from it) and a camera body with its view cone rendering the last box onto its image plane (render: the picture it makes). Label each box natively at box<n>.bottom.',
    anchors: 'box1 … (centres), box1.top, box1.bottom …, sun, cam',
    // Why the oblique: a row of boxes through a pinhole showed each box from its own side; in a
    // cabinet oblique every box is the same, front square-on, on one ground (DreamFusion).
    camera: VIEW_PRESETS['top-oblique'].camera,
    options: [
      [
        'photos',
        '[]',
        'one picture per box ({ kind } or a project path); a box without one holds a splat cloud'
      ],
      ['count', '3 (or photos.length)', 'how many boxes'],
      ['pitch', '1.6', 'box spacing along the row (the boxes are 1 unit)'],
      ['render', '—', 'the picture on the camera’s image plane'],
      ['light', 'true', 'false: no sun and no beam into the first box'],
      ['camera', 'true', 'false: no camera at the end'],
      ['beams', 'true', 'false: no beams between the boxes'],
      [
        'cloudRole, beamRole, lightRole',
        "'accent', 'neutral', 'second'",
        'the splats’, beams’ and the light beam’s roles'
      ]
    ],
    draw: volumeBoxes
  }
}
