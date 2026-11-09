// Option checks for the kit: an unknown value throws with the values that work, instead of being
// ignored and drawing something else.

/** `value` if it is one of `allowed` (or undefined), else an error naming the choices. */
export function oneOf(name, value, allowed) {
  if (value === undefined || value === null || allowed.includes(value)) {
    return value
  }
  throw new Error(`Unknown ${name} ${JSON.stringify(value)}; use one of ${allowed.join(', ')}`)
}

export const ARROW_HEADS = ['triangle', 'arrow', 'chevron', 'bar', 'dot', 'circle', 'none']
export const ROUTES = ['straight', 'hv', 'vh']
