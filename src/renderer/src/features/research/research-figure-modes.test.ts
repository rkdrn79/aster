import { beforeEach, describe, expect, it } from 'vitest'
import {
  carefulSlowdown,
  figureModeDefaults,
  parseFigureModesSaved,
  projectFigureModes,
  projectHasOwnFigureModes,
  readFigureModesSaved,
  resetProjectFigureModes,
  setFigureModeDefaults,
  setFigureReferenceFolder,
  setProjectFigureModes
} from './research-figure-modes'
import { effectiveFigureModes, figurePromptModes } from './research-figure-reference-library'
import { carefulPhase, parseCarefulCritic, parseCarefulRecord } from './research-figure-careful'

const scope = { hostId: 'local', workspaceId: 'ws-1' }
const other = { hostId: 'local', workspaceId: 'ws-2' }

function fakeStorage(): Storage {
  const items = new Map<string, string>()
  return {
    get length() {
      return items.size
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value)
  }
}

beforeEach(() => {
  const storage = fakeStorage()
  Object.assign(globalThis, {
    window: { localStorage: storage, addEventListener: () => {}, removeEventListener: () => {} }
  })
})

describe('the Figure agent switches on this device', () => {
  it('starts a new install with careful off, references on only with a folder, concept off', () => {
    const saved = readFigureModesSaved()
    expect(figureModeDefaults(saved, false)).toEqual({
      careful: false,
      rounds: 3,
      pick: 'agent',
      references: false,
      pinned: [],
      concept: false,
      conceptStyle: 'redraw'
    })
    expect(figureModeDefaults(saved, true).references).toBe(true)
  })

  it('keeps each project its own choices over the defaults, and resets them', () => {
    setFigureModeDefaults({ careful: true, rounds: 3 })
    setProjectFigureModes(scope, { careful: false, pinned: ['nerf'], references: true })
    const saved = readFigureModesSaved()
    expect(projectFigureModes(saved, scope, false)).toMatchObject({
      careful: false,
      rounds: 3,
      references: true,
      pinned: ['nerf']
    })
    expect(projectFigureModes(saved, other, false)).toMatchObject({ careful: true, pinned: [] })
    expect(projectHasOwnFigureModes(saved, scope)).toBe(true)
    resetProjectFigureModes(scope)
    expect(projectHasOwnFigureModes(readFigureModesSaved(), scope)).toBe(false)
  })

  it('clamps rounds, drops unknown values and keeps the folder setting', () => {
    const saved = parseFigureModesSaved(
      JSON.stringify({
        defaults: { rounds: 40, careful: 'yes', pick: 'robot' },
        projects: { x: { rounds: 0, pinned: ['a', 2, 'b', 'c', 'd', 'e'] } },
        folder: ' /refs '
      })
    )
    expect(saved.defaults).toMatchObject({ rounds: 10, careful: undefined, pick: undefined })
    expect(saved.projects.x?.rounds).toBe(1)
    expect(saved.projects.x?.pinned).toEqual(['a', 'b', 'c', 'd'])
    expect(saved.folder).toBe('/refs')
    setFigureReferenceFolder('/Users/me/refs')
    expect(readFigureModesSaved().folder).toBe('/Users/me/refs')
    setFigureReferenceFolder(null)
    expect(readFigureModesSaved().folder).toBeUndefined()
  })

  it('turns concept off where Codex cannot draw it, and passes the folder only for this computer', () => {
    setProjectFigureModes(scope, { concept: true, careful: true })
    const saved = readFigureModesSaved()
    expect(
      effectiveFigureModes(saved, scope, {
        exists: true,
        concept: { available: false, reason: 'x' }
      }).concept
    ).toBe(false)
    const modes = effectiveFigureModes(saved, scope, {
      exists: true,
      concept: { available: true, reason: null }
    })
    expect(figurePromptModes(modes, { hostId: 'local', folder: '/refs', exists: true })).toEqual({
      careful: { rounds: 3, pick: 'agent' },
      references: { pinned: [], library: '/refs' },
      concept: true,
      conceptStyle: 'redraw'
    })
    expect(
      figurePromptModes(modes, { hostId: 'ssh:gpu', folder: '/refs', exists: true }).references
    ).toEqual({ pinned: [], library: null })
  })

  it('says how much slower careful drawing is', () => {
    expect(carefulSlowdown(5)).toBe(4)
    expect(carefulSlowdown(1)).toBe(2)
    expect(carefulSlowdown(10)).toBe(7)
  })

  it('keeps how the concept image is used per project: redraw by default, hybrid when chosen', () => {
    setProjectFigureModes(scope, { concept: true, conceptStyle: 'hybrid' })
    const saved = readFigureModesSaved()
    expect(projectFigureModes(saved, scope, false)).toMatchObject({
      concept: true,
      conceptStyle: 'hybrid'
    })
    expect(projectFigureModes(saved, other, false).conceptStyle).toBe('redraw')
    expect(
      parseFigureModesSaved(JSON.stringify({ defaults: { conceptStyle: 'paint' } })).defaults
        .conceptStyle
    ).toBeUndefined()
  })
})

describe("careful drawing's record as the panel reads it", () => {
  it('reads the harness record and names the phase', () => {
    const record = parseCarefulRecord(
      JSON.stringify({
        rounds: 3,
        sketches: [
          { name: 's1', note: 'row' },
          { name: 's2', note: 'loop' },
          { name: 'x9', note: 'bad' }
        ],
        chose: null,
        reviews: [],
        done: null,
        wantCritic: null
      })
    )
    expect(record?.sketches.map((sketch) => sketch.name)).toEqual(['s1', 's2'])
    expect(record && carefulPhase(record, 'person')).toBe('Pick a sketch')
    const reviewed = parseCarefulRecord(
      JSON.stringify({
        rounds: 3,
        sketches: [{ name: 's1', note: '' }],
        chose: { name: 's1', why: 'reads', by: 'agent' },
        reviews: [{ round: 1, verdict: 'revise', fixes: ['Move the encoder 24 units left'] }]
      })
    )
    expect(reviewed && carefulPhase(reviewed, 'agent')).toBe('Art director · round 2 of 3')
    expect(parseCarefulRecord('not json')).toBeNull()
    expect(parseCarefulCritic('{"address":"orca_session_id:abc","agent":"codex"}')?.agent).toBe(
      'codex'
    )
    expect(parseCarefulCritic('{"address":"terminal:1"}')).toBeNull()
  })
})
