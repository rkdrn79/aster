import { HarnessError } from './research-harness-error.mjs'

const commandGroups = new Set([
  'run',
  'claim',
  'loop',
  'brief',
  'quality',
  'proposal',
  'rate',
  'analysis'
])
const globalValues = new Set(['--project'])
const globalBooleans = new Set(['--json', '--help'])

/** `run exec` and friends are two words; everything else is one. */
export function splitCommand(argv) {
  const [first, second, ...rest] = argv
  if (commandGroups.has(first) && second && !second.startsWith('-')) {
    return { name: `${first} ${second}`, rest }
  }
  return { name: first ?? null, rest: second === undefined ? [] : [second, ...rest] }
}

export function requestsJson(argv) {
  const end = argv.indexOf('--')
  return (end === -1 ? argv : argv.slice(0, end)).includes('--json')
}

/**
 * Parses `--key value`, `--key=value`, boolean flags, positionals, and a `--` passthrough.
 * A value may not start with `--`; use `--key=--value` for that.
 */
export function parseCommandArguments(tokens, spec) {
  const values = new Set([...(spec.values ?? []), ...(spec.repeatable ?? []), ...globalValues])
  const booleans = new Set([...(spec.booleans ?? []), ...globalBooleans])
  const repeatable = new Set(spec.repeatable ?? [])
  const options = {}
  const positionals = []
  let passthrough = null
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token === '--') {
      if (!spec.passthrough) {
        throw new HarnessError('usage', 'This command does not take a -- command')
      }
      passthrough = tokens.slice(index + 1)
      break
    }
    if (!token.startsWith('--')) {
      if (positionals.length >= (spec.positionals ?? 0)) {
        throw new HarnessError('usage', `Unexpected argument: ${token}`)
      }
      positionals.push(token)
      continue
    }
    const equals = token.indexOf('=')
    const key = equals === -1 ? token : token.slice(0, equals)
    if (booleans.has(key)) {
      if (equals !== -1) {
        throw new HarnessError('usage', `${key} does not take a value`)
      }
      options[key] = true
      continue
    }
    if (!values.has(key)) {
      throw new HarnessError('usage', `Unknown option: ${key}`)
    }
    const value = equals === -1 ? tokens[(index += 1)] : token.slice(equals + 1)
    if (value === undefined || value === '' || (equals === -1 && value.startsWith('--'))) {
      throw new HarnessError('usage', `${key} needs a value`)
    }
    if (repeatable.has(key)) {
      options[key] = [...(options[key] ?? []), value]
    } else if (key in options) {
      throw new HarnessError('usage', `Repeated option: ${key}`)
    } else {
      options[key] = value
    }
  }
  for (const key of spec.required ?? []) {
    if (!(key in options)) {
      throw new HarnessError('usage', `${key} is required`)
    }
  }
  return { options, positionals, passthrough }
}

export function numberOption(options, key) {
  if (options[key] === undefined) {
    return undefined
  }
  const value = Number(options[key])
  if (!Number.isFinite(value)) {
    throw new HarnessError('invalid_argument', `${key} must be a finite number`)
  }
  return value
}

export function integerOption(options, key) {
  const value = numberOption(options, key)
  if (value !== undefined && !Number.isInteger(value)) {
    throw new HarnessError('invalid_argument', `${key} must be an integer`)
  }
  return value
}

export function jsonObjectOption(options, key) {
  if (options[key] === undefined) {
    return undefined
  }
  let value
  try {
    value = JSON.parse(options[key])
  } catch {
    throw new HarnessError('invalid_argument', `${key} must be a JSON object`)
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HarnessError('invalid_argument', `${key} must be a JSON object`)
  }
  return value
}
