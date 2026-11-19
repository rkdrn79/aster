// The kit reference for the perspective engine's round-14 primitives (topic perspective): meshes
// and organic solids, the scene's light and shadows, the look of meshes (cel bands, outlines, a
// hand-drawn line) and photos on any face. Listed after the scene primitives on the same page.

export const PERSPECTIVE_ENGINE_REFERENCE = [
  {
    topic: 'perspective',
    name: 'perspectives',
    call: 'fig.perspectives({ camera, x, y, w, h, scenes: [{ id, x, y, w, h, draw | template, options, labels, roles }], arrows: [{ from, to, label, role, y }], gap: 12, arrowGap: 48 }) → { scenes: [each as fig.perspective returns], scale, camera, arrows }',
    does: "Several scenes through one camera at one scale (Mip-NeRF's ray, cone and Gaussians; two NeRF views): the camera is fitted to all of them (view or camera as for fig.perspective), the scale is the largest at which each fits its own box, and the scenes of one row sit on one baseline (the same world height at the same page height, so o, the image planes and the cameras line up), centred together in the row. Scenes without their own x, y, w, h are laid out in a row inside the call's x, y, w, h, each as wide as its drawing, the spare width spread between them. arrows join stages natively, level from one scene's right to the next one's left at the height they share, label above (a cone → 𝒩 → its Gaussians; a field → render → image): a two-stage story is two scenes and an arrow, never both stages in one scene. A template's default camera turns round the scene (azimuth only) when that fills a wide, short row clearly better; give camera to fix it. Prefer it to chaining like when panels show the same geometry. Roles anywhere in a scene may be a #hex (a paper's own colour), shaded on its own ramp."
  },
  {
    topic: 'perspective',
    name: 'b.mesh',
    call: 'b.mesh({ id, vertices: [[x, y, z]], faces: [[i, j, k, …]] | triangles: [[p, p, p]], uvs, photo, role, tone, opacity, shading, smooth: true, outline, wire, fill, cast }) · b.surface({ id, z: (x, y) => height, x: [x0, x1], y: [y0, y1] | f: (u, v) => [x, y, z], u, v | points: rows, n: 24 | [nu, nv], … })',
    does: 'Any solid or sheet as a mesh: faces counter-clockwise from outside. A surface from a height field (a loss landscape), a parametric function (a deformed sphere, a manifold) or a grid of points. Meshes shade in tone bands of their role cut along the light (so the bands follow the curve), cull their back when closed and opaque, print their silhouette and creases (hidden parts left out, or dashed), and cast shadows on a floor. uvs (0–1 photo shares per vertex) with photo map a picture onto it. Anchors <id>, <id>.top, <id>.bottom.'
  },
  {
    topic: 'perspective',
    name: 'b.tube',
    call: 'b.tube({ id, points, r: 0.1 | (t) => r, sides: 14, smooth: true, caps: true, role }) · b.sweep({ id, points, profile: [[x, y]], r }) · b.lathe({ id, profile: [[radius, height]], at, axis: [0, 0, 1], sides: 32 }) · b.ellipsoid({ id, at, r | radii: [along, across, across], axis, rings, segments }) · b.blob({ id, balls: [{ at, r }], n: 22, blend: 1.8 })',
    does: 'Curved and organic solids: a tube along a smooth path (a trajectory in 3D, a fibre, a cable; r may taper with t), any closed profile swept along a path, a turned solid (a cup, a vase, a chess piece), an opaque lit ellipsoid or sphere, and a blob of metaballs melted into one smooth surface (a cell, a creature, a bunny), each ball keeping its own size, near balls joining. Gaussians stay splats (b.gaussian): see-through, sorted by centre.'
  },
  {
    topic: 'perspective',
    name: 'b.light',
    call: "b.light({ id, dir: [x, y, z] | at: [x, y, z], kind: 'sun' | 'point', glyph: 'sun' | 'none', r: 4.5, role: 'second', tone, shadows: true }) · b.floor({ …, shadows: true, shadowOpacity: 0.16 }) · b.plane({ …, receive: true, cast: false })",
    does: "The scene's one light: shading of boxes, voxels and meshes follows it, and solids cast shadows from it onto the floor (one union, so overlaps do not darken) with a soft contact shadow where they rest and a little darkening just above the floor. at places a sun glyph there (DreamFusion's P(light)); dir is the direction toward the light. Without b.light the house light comes from the upper left. A plane with receive: true takes shadows too; shadows: false on the light or the floor turns them off."
  },
  {
    topic: 'perspective',
    name: 'b.look',
    call: "b.look({ shading: 'three-tone' | 'cel' | 'two-tone' | 'smooth' | 'flat', outline: { pt: 0.75, tone: 9, role, crease: 40 | false, hidden: 'none' | 'dash' } | false, sketch: { roughness: 1, bowing: 1, seed } | true })",
    does: "The look of what is drawn after it: cel or banded shading in the world's roles (no new hues), outline weight and tone (silhouettes bold, creases lighter; a wire: { hidden: 'dash' } mesh dashes its far side), and an optional hand-drawn line (seeded, so it redraws the same). Any mesh, box, line or ray may take these options itself. Defaults, with nothing asked: the house light from the upper left, fills a tone lighter under ink edges (the scene's look 'line'), meshes in two tones (lit and shaded) with an outline, planes without a photo a tone or two darker when turned from the light (so a tri-plane's walls read), and on a b.floor each solid's cast and contact shadow. Off switches: fig.perspective({ look: 'flat' }) for the old darker fills, b.look({ planes: false }) or a plane's shade: false for flat planes, b.floor({ shadows: false }) or b.light({ shadows: false }) for no shadows."
  },
  {
    topic: 'perspective',
    name: 'photos on faces',
    call: 'photo: { src | kind, crop, fit, opacity, repeat: [nx, ny], wash: 0.35, tint: role | { role, opacity } } · b.box({ …, photos: { front, back, left, right, top, bottom } }) · b.disc({ …, photo }) · b.patchGrid({ …, patchGap })',
    does: 'A photo on any flat face in true perspective (cut into affine pieces where the view needs it), embedded once however often it is used. repeat tiles it, wash lays white over it (the soft photo of Swin), tint a colour. Box faces and discs take photos; patchGap pulls every patch of a patch grid apart (ViT patch tokens), each with its piece of the photo.'
  }
]
