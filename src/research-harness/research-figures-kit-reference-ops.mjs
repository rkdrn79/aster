// The kit reference for round 14's parts: the switch, the code card, the vector pair and the
// probability path (pathDensity), split from research-figures-kit-reference.mjs.

export const OPS_REFERENCE = [
  {
    topic: 'shapes',
    name: 'switch',
    call: "fig.switch({ id, x, y | cx, cy, w: 32, h: 24, direction: 'right' | 'left' | 'down' | 'up', to: 0 | 1, r: 2.5, color: 'ink', label, labelSide: 'below' | 'above' }) → { id, x, y, width, height, in, out: [out0, out1] }",
    does: "A switch (SPDT) that sends its input to one of two outputs, as Latent Diffusion's conditioning switch: an input terminal, two output terminals (direction right: on the right edge, top and bottom) and a lever from the input towards output `to`. Arrows bind to the terminals: arrow({ from: 'enc', to: 'sw-in' }), arrow({ from: 'sw-out0', to: 'concat' }) (straight when level, else one elbow). Key it in a legend with { swatch: 'switch' }. Binds: <id>-in, <id>-out0, <id>-out1 (the id is an invisible box round it)."
  },
  {
    topic: 'genres',
    name: 'code',
    call: "fig.code({ id, x, y, w: fit, h: fit, code, size: 14, title, titleSize: 14, highlight: [line | { line, text, color } | { line, from, to, color }], lineNumbers: false, tab: 4, pad: 10, lineHeight: 1.4, color: 'panel', stroke, textColor: 'ink' }) → { id, x, y, width, height, char, pitch, rows, lines }",
    does: "A code card that keeps indentation exactly (an agent's program, a prompt template): the code in Cascadia, Excalidraw's monospace, every run placed by its column, the shared indent removed and tabs as tab spaces. highlight: a line number (1 = the first line) tints that whole line; { line, text: 'bot.dig' } or { line, from, to } (columns) tints a span and sets it in the colour's ink; color defaults to the accent. title is a header row over a thin rule. w and h fit the code (7 pt) unless given; a line wider than w is a kit warning (code never wraps: shorten or drop it). rows gives each line's y for arrows and labels; char is one column's width. Binds: the id."
  },
  {
    topic: 'science',
    name: 'vectorPair',
    call: "fig.vectorPair({ id, at: [x, y], u: [dx, dy], v: [dx, dy], labels: ['$u_t$', '$u_t^\\\\theta$'], color: 'accent', secondColor: 'ink' }) → { id, x, y, width, height }",
    does: 'Two vectors from one point, the target and its estimate (u_t beside u_t^θ, a gradient and its stochastic estimate): a dot, u solid in the colour (1.25 pt), v dashed in ink, each with a head and its label just past the tip. They slant on purpose (vectors, not connectors).'
  },
  {
    topic: 'science',
    name: 'pathDensity',
    call: "fig.pathDensity({ id, x, y, w, h, layout: 'row' | 'overlay' | 'band', from: 'gaussian', to: '8gaussians', t: [0, 1/3, 2/3, 1] | steps: 4, paths: { n: 12, kind: 'ode' | 'sde' | 'straight', seed: 1, noise: 1, coupling: 'ot', highlight: [i] (the most curved), strokeWidth: 1, highlightWidth: 2.5 } | false, fill: 0.92, levels: 3, r: 2.5, color: 'accent', gap: 12, labels: true | ['…'], labelSize, axis: true, outline: true, trails: true, bands, range: [-3, 3] }) → { id, x, y, width, height, panels, anchors }",
    does: "The older name of flow rows and overlays; 1D bands. Band draws 1D conditional paths. p_t of x_t = (1 − t) x_0 + t x_1 from `from` (noise) to `to` (data; the dists of density). row (default; w 440, h 150; flow's strip): square panels at each t on ONE shared scale, the bands turning from gray (t = 0) to the colour (t = 1), the same seeded samples moving through them with their trails (ODE: curved, never crossing; SDE: jagged; straight: coupled pairs), one example path highlighted (paths.highlight, default the most curved), t labels and a time arrow below; a panel under 72 units (half an inch) warns with how many fit. overlay (w, h 160): one panel, the source as gray outline rings, the target filled, every path whole with a ramp and the example in the colour with a head. band (w 220, h 120): 1D conditional paths over t, each a mean line with a ±2σ band, bands: [{ from: [mean, sigma], to: [mean, sigma], color, label }], default flow matching's N(0, 1) → N(x_1, σ_min²) for two x_1 (I-CFM or OT-CFM: one σ for both ends, between paired x_0 and x_1). anchors: 't<k>.path<i>' (path i in panel k), 't<k>.center', 'path<i>.start' | '.mid' | '.end' (overlay), 'band<i>.start' | '.end'. Use it instead of computing mixtures by hand; for a teaser row of 3–4 t, give it the page width and about 1.1 in of height. profiles: 6 (band) draws the same conditional paths as density curves in rows, t = 1 (the data, in ink) at the top down to t = 0 (the noise): FM, I-CFM and OT-CFM side by side; marginals: { from: [mean, sd], to: { modes, sd } } sets the ink curves."
  }
]
