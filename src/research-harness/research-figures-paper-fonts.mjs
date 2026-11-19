// The paper look's text faces: the LaTeX fonts a manuscript prints in, so labels and math read as
// one typeface. Latin Modern Roman (Computer Modern) by default; TeX Gyre Termes (Times) when the
// preamble loads Times or a venue style set in Times (NeurIPS, ICLR, ICML, CVPR …). Both ship
// unmodified with the app (GUST Font License) and print through Excalidraw as editable text under
// these fontFamily numbers, which Excalidraw itself leaves unused. Pure, shared with the app.

/** fontFamily numbers and CSS names of the paper look's two faces. */
export const PAPER_SERIF = {
  cm: { id: 20, name: 'Latin Modern Roman', file: 'lmroman10-regular.otf' },
  times: { id: 21, name: 'TeX Gyre Termes', file: 'texgyretermes-regular.otf' }
}
export const PAPER_SERIF_IDS = new Set(Object.values(PAPER_SERIF).map((face) => face.id))

/**
 * Where Excalidraw puts the first baseline of these faces, in font sizes below a text's top: it
 * has no metrics for a family it does not bundle and takes Virgil's (ascent 886, descent 374 per
 * 1000, line 1.25), so the offset is 0.886 less half of the 0.01 the line box falls short.
 */
export const PAPER_SERIF_BASELINE = 0.881

// Why these: \usepackage{times}, mathptmx, newtx, txfonts and the venue styles of NeurIPS, ICLR,
// ICML, CVPR/ICCV, AAAI, ACL and IEEE set the body in Times (ECCV's llncs stays in CM).
const TIMES_PREAMBLE =
  /\\usepackage(?:\[[^\]]*\])?\{[^}]*\b(times|mathptmx|newtxtext|newtx|txfonts|ptm|tgtermes|neurips[_\w]*|nips[_\w]*|iclr[_\w]*|icml[_\w]*|cvpr|iccv|wacv|aaai[_\w]*|acl|naacl|emnlp|coling)\b[^}]*\}|\\documentclass(?:\[[^\]]*\])?\{(IEEEtran|aaai[_\w]*)\}/

/** 'times' when a manuscript's preamble prints in Times, else 'cm'; null without a preamble. */
export function serifForPreamble(source) {
  if (typeof source !== 'string' || !source.trim()) {
    return null
  }
  const text = source.replaceAll(/(^|[^\\])%.*$/gm, '$1')
  const end = text.indexOf('\\begin{document}')
  return TIMES_PREAMBLE.test(end === -1 ? text : text.slice(0, end)) ? 'times' : 'cm'
}

/** The face for a `font` option ('cm' | 'times', or a family name); unknown names are null. */
export function paperSerif(font) {
  if (!font) {
    return null
  }
  const key = String(font).toLowerCase()
  if (Object.hasOwn(PAPER_SERIF, key)) {
    return { key, ...PAPER_SERIF[key] }
  }
  const named = Object.entries(PAPER_SERIF).find(([, face]) => face.name.toLowerCase() === key)
  return named ? { key: named[0], ...named[1] } : null
}
