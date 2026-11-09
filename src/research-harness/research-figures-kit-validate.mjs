// The kit never writes NaN. JSON turns NaN into null, and a scene with null coordinates breaks
// the figure in Aster, so every item's numbers are checked when it is drawn and again on save,
// and the error names the kit call, its id and the option that was not a number.

const finite = (value) => typeof value === 'number' && Number.isFinite(value)

// Options that take numbers (or [w, h] pairs); a string or an object there is the usual cause.
const NUMERIC_OPTIONS = new Set([
  'x',
  'y',
  'cx',
  'cy',
  'w',
  'h',
  'width',
  'height',
  'size',
  'gap',
  'cell',
  'cellSize',
  'r',
  'pad',
  'rows',
  'cols',
  'n',
  'count',
  'steps',
  'thumbSize',
  'labelSize',
  'textSize',
  'radius',
  'offset',
  'depth',
  'scale'
])

/** Paths of the numbers in an element that are not finite (`x`, `points[2][1]`, `crop.width`). */
export function nonFiniteFields(element) {
  const found = []
  const walk = (value, at) => {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        found.push(at)
      }
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${at}[${index}]`))
    } else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        walk(item, at ? `${at}.${key}` : key)
      }
    }
  }
  walk(element, '')
  return found
}

const shown = (value) => {
  if (typeof value === 'number') {
    return String(value)
  }
  const text = JSON.stringify(value)
  return text && text.length > 40 ? `${text.slice(0, 39)}…` : String(text)
}

/**
 * The options of a call that could have made NaN: non-finite numbers, or non-numbers where a
 * number goes; a [w, h] pair is named only when nothing else is (the option may take one number).
 */
export function suspectOptions(spec) {
  if (!spec || typeof spec !== 'object') {
    return []
  }
  const pairs = []
  const suspects = Object.entries(spec).flatMap(([key, value]) => {
    if (typeof value === 'number') {
      return finite(value) ? [] : [`${key}: ${shown(value)}`]
    }
    if (!NUMERIC_OPTIONS.has(key) || value === undefined || value === null) {
      return []
    }
    if (Array.isArray(value) && value.length === 2 && value.every((item) => finite(item))) {
      pairs.push(`${key}: ${shown(value)}`)
      return []
    }
    return [`${key}: ${shown(value)}`]
  })
  return suspects.length ? suspects : pairs
}

/**
 * Throws when an item drew a number that is not finite: names the kit call (`fig.matrix`), the
 * item's id, the element and field, and the options that look wrong.
 */
export function assertFiniteItems(items, { owner, call } = {}) {
  for (const item of items) {
    const fields = nonFiniteFields(item)
    if (!fields.length) {
      continue
    }
    const value = fields[0]
      .split(/\.|\[|\]/)
      .filter(Boolean)
      .reduce((at, key) => at?.[key], item)
    const what = call?.name
      ? `fig.${call.name}({ id: '${owner}' }) drew ${item.id} with`
      : `${item.id}${owner && owner !== item.id ? ` (drawn by ${owner})` : ''} has`
    const suspects = suspectOptions(call?.spec)
    throw new Error(
      `${what} ${fields[0]} = ${value}${fields.length > 1 ? ` (and ${fields.length - 1} more)` : ''}. ${
        suspects.length
          ? `Check ${suspects.join(', ')}: a number is expected there.`
          : 'Check the numbers given to it (positions, sizes, counts).'
      } The kit never saves NaN, which would break the figure in Aster.`
    )
  }
}

/**
 * Wraps every method of `fig` so the innermost kit call running is known (`current()`), to name
 * it in an error. Getters stay getters; a promise's call ends when it settles.
 */
export function trackKitCalls(fig) {
  const stack = []
  for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(fig))) {
    const method = descriptor.value
    if (typeof method !== 'function') {
      continue
    }
    fig[name] = (...args) => {
      const spec = args.find((arg) => arg && typeof arg === 'object' && !Array.isArray(arg))
      const entry = { name, spec }
      stack.push(entry)
      const done = () => stack.splice(stack.lastIndexOf(entry), 1)
      let result
      try {
        result = method(...args)
      } catch (error) {
        done()
        throw error
      }
      if (result && typeof result.then === 'function') {
        return result.finally(done)
      }
      done()
      return result
    }
  }
  return () => stack.at(-1) ?? null
}
