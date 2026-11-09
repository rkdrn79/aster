import { HarnessError } from './research-harness-error.mjs'

// Why no node imports: the app validates the same files in the renderer.

export function invalid(message) {
  return new HarnessError('invalid_argument', message)
}

export function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function text(value, label, { max, fallback = '', required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) {
      throw invalid(`${label} is required`)
    }
    return fallback
  }
  if (typeof value !== 'string') {
    throw invalid(`${label} must be a string`)
  }
  if (required && !value.trim()) {
    throw invalid(`${label} must not be empty`)
  }
  if (value.length > max) {
    throw invalid(`${label} must be at most ${max} characters`)
  }
  return value
}

export function nullableText(value, label, max) {
  return value === undefined || value === null || value === '' ? null : text(value, label, { max })
}

export function integer(value, label, { min, max, fallback }) {
  if (value === undefined || value === null) {
    return fallback
  }
  if (!Number.isInteger(value) || value < min || value > max) {
    throw invalid(`${label} must be an integer from ${min} to ${max}`)
  }
  return value
}

export function oneOf(value, label, allowed, fallback) {
  if (value === undefined && fallback !== undefined) {
    return fallback
  }
  if (!allowed.includes(value)) {
    throw invalid(`${label} must be one of: ${allowed.join(', ')}`)
  }
  return value
}

export function list(value, label, key) {
  const items = Array.isArray(value) ? value : isObject(value) ? value[key] : undefined
  if (!Array.isArray(items)) {
    throw invalid(`${label} must be a JSON array or an object with a "${key}" array`)
  }
  return items
}

export function uniqueIds(items, label) {
  const seen = new Set()
  for (const item of items) {
    if (seen.has(item.id)) {
      throw invalid(`Duplicate ${label} ID: ${item.id}`)
    }
    seen.add(item.id)
  }
}
