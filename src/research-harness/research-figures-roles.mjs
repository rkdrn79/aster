// Colour roles: the names a figure colours by meaning (input, output, data, model, frozen, ours,
// and the component hues a–d with a part such as -stroke or -dark), and what each becomes in a
// quiet preset. The worlds give every role a hue of its own (WORLD_ROLES). Pure.
import { hexToOklch, oklchToHex } from './research-figures-color-space.mjs'

/** A colour name and its part: `model-dark` is `model` and `dark`. */
export const ROLE_PART = /^(.*?)(?:-(strong|ink|solid|stroke|light|dark))?$/
/** A role part on a gray: the heavier gray, the ink, the mid gray for a stroke or a marker. */
const GRAY_PART = {
  strong: 'strong',
  ink: 'ink',
  solid: 'mid',
  stroke: 'mid',
  light: 'panel',
  dark: 'strong'
}

/** A role name (input, model, a–d, with a part) as the colour name it takes under `roles`. */
export function roleTarget(roles, name) {
  const [base, part] = ROLE_PART.exec(name).slice(1)
  const target = roles?.[base]
  if (!target || target === base) {
    return name
  }
  if (['block', 'strong', 'mid', 'panel'].includes(target)) {
    return part ? GRAY_PART[part] : target
  }
  return part ? `${target}-${part}` : target
}

/**
 * Role names in the quiet presets: the component hues a–d fall back to the preset's accents and
 * grays, and input, output, data, model and frozen stay gray (blue-amber's given parts amber), so
 * a script that colours by role reads quietly there and in colour in a world (WORLD_ROLES).
 */
export function quietRoles(id, accents) {
  const given = id === 'blue-amber' ? accents[1].name : 'block'
  return {
    a: accents[0].name,
    b: accents[1]?.name ?? 'strong',
    c: accents[2]?.name ?? 'block',
    d: 'block',
    ours: accents[0].name,
    output: 'block',
    model: 'block',
    input: given,
    data: given,
    frozen: given
  }
}

/** The outline a literal fill takes in a world: darker than the fill, in its hue, muted. */
export function pairStroke(hex) {
  const color = hexToOklch(hex)
  return color
    ? oklchToHex({ L: Math.min(0.56, color.L - 0.3), C: Math.min(color.C * 1.3, 0.1), h: color.h })
    : 'transparent'
}
