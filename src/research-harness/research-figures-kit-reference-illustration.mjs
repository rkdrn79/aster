// The kit reference for illustrations (objects, assets, scenes, drawn objects and leaders),
// split from research-figures-kit-reference.mjs to keep files short; KIT_REFERENCE appends it.

export const ILLUSTRATION_REFERENCE = [
  {
    topic: 'illustration',
    name: 'illustration',
    call: 'fig.illustration({ id, asset | scene | draw | svg, x, y, w, h, style, view, light, roles, skin, options, mirror, ground, frame }) → { x, y, width, height, anchors, items, point }',
    does: "A picture as one vector image that repaints with the palette. It stays vector in the SVG and PDF and follows the accent by colour role. asset: a drawn object or bundled asset by name (`figures kit illustrations <words>` searches: 'robot arm', 'gpu server', 'microscope'), with its options (figures kit illustrations lists them). scene: [{ id, asset, at: [x, y, z], scale, roles, options, mirror }] places several objects in one picture at world points (about a centimetre per unit; x runs to the lower right, y to the lower left, z up), drawn back to front with their contact shadows; an item { draw: (b) => …, layer: 'floor' } draws its own part (a path on the floor goes under everything); ground: 'tile' | 'room' | { kind, pad, size, wall }. draw: (b) => … draws your own object with the builder (box, slab, cylinder, prism, block, tube, sphere, line, shadow; `figures kit draw`). svg: a role-tagged SVG (another kit's output), or any SVG, which keeps its own colours (a warning says so). w and/or h fit it keeping its aspect (neither: 1 in tall). style (the house look): flat (no outlines, three tones from one light) | tonal (thin same-hue outline) | line (ink outlines over light fills) | mono (ink on white); view: iso | dimetric | oblique; light: left | right; the first call records them on the page and later calls inherit them; asking for another prints a warning. roles: { accent: 'second' | 'neutral' | 'good' | 'bad' | '#hex' } repaints a role (ours in the accent, a baseline in second or neutral); skin: light | medium | deep. Returns anchors (named points such as 'gripper', in scene units), items (each scene object's box) and point([x, y, z]) for any world point, so leaders and arrows can aim into it. Binds: the id."
  },
  {
    topic: 'illustration',
    name: 'illustrationStyle',
    call: "fig.illustrationStyle({ style: 'flat' | 'tonal' | 'line' | 'mono', view: 'iso' | 'dimetric' | 'oblique', light: 'left' | 'right', skin }) → { look, view, light, skin }",
    does: 'The figure’s one illustration look, view and light. They are kept on the page, with the skin tone. Without it the first illustration decides; the default look follows the preset (line for outline, mono for print-mono, else flat).'
  },
  {
    topic: 'illustration',
    name: 'illustrations',
    call: "fig.illustrations('robot arm') → [{ name, kind, title, tags, roles, options, projection, licence }]",
    does: 'Searches drawn objects and bundled assets. Every word must hit a name, title or tag, best first; the same as `figures kit illustrations <words>`.'
  },
  {
    topic: 'illustration',
    name: 'leader',
    call: "fig.leader({ id, to: [x, y], at: [x, y], text | tex, align: 'left' | 'right', color: 'muted', size: 14 })",
    does: "A label joined to a point by a right-angle leader. The point is an anchor or point([x, y, z]); the leader runs across then one drop, 0.5 pt in muted, ending in a small dot. at is where the text starts (its right end with align: 'right'); text mixes words and $math$, tex is all math; a target under the text gets a straight drop from its edge, never a line through it; keep the labels in one column beside the picture and never on it. Ids: <id>-text, <id>-line, <id>-dot."
  },
  {
    topic: 'illustration',
    name: 'draw',
    call: 'draw: (b) => { b.box({ at, size, radius, role, tone }); b.cylinder({ at, r, h, axis }); … }',
    does: "Draws an object no asset has, with the builder. Use it inside fig.illustration({ draw }), in the house style. b.box / b.slab ({ at: [x, y, z], size: [x, y, z], radius }) return faces { top, left, right } for decals: face.rect(u, v, w, h, { radius, role, tone }), face.circle(u, v, r), face.polygon(points), face.line(points) (u to the right as seen, v down). b.cylinder({ at, r, h, axis: 'z' | 'x' | 'y' | [vector] }) returns its cap as a decal face; b.extrude({ at, outline, axis, h }); b.prism({ at, profile, axis, length }); b.block({ origin, u, v, w }) (a tilted lid or screen; returns face); b.tube({ from, to, r }) (a link, a pipe); b.sphere({ at, r }); b.line(points, { role, tone, weight }); b.path(points, { dash, head }) (a trajectory on the floor, its arrowhead lying flat); b.shadow({ at, size, radius }) and b.roundShadow({ at, r }) first, under the object; b.place({ at, scale, roles, mirror }, (b) => …) to reuse a part. Colour: role (accent, second, neutral, metal, skin, hair, wood, leaf, good, bad, white, ink) and tone 0 (pale) – 11 (deep) of its lit face; faces turned from the light shade themselves. Rules: fronts on the +y side (the lit left face), bodies neutral tones 0–2, the accent on the one part that matters, details at least 3 pt at print, no text, no glow, no sparkles."
  }
]
