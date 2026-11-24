import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { attachResearchSideShortcuts, resolveResearchSideShortcut } from './research-side-shortcuts'

function key(code: string, keyValue: string, modifiers: Partial<Record<string, boolean>> = {}) {
  return {
    type: 'keyDown',
    key: keyValue,
    code,
    meta: false,
    control: false,
    alt: false,
    shift: false,
    ...modifiers
  }
}

const never = (): boolean => false

function resolve(input: ReturnType<typeof key>) {
  return resolveResearchSideShortcut(input, 'darwin', undefined, never)
}

describe('keys pressed in a project side', () => {
  it('keeps page, close and split keys about the side itself', () => {
    expect(resolve(key('Digit3', '3', { meta: true }))).toEqual({ kind: 'page', index: 2 })
    expect(resolve(key('KeyW', 'w', { meta: true }))).toEqual({ kind: 'close' })
    expect(resolve(key('Backslash', '\\', { meta: true }))).toEqual({ kind: 'open-beside' })
    expect(resolve(key('Backslash', '|', { meta: true, shift: true }))).toEqual({
      kind: 'focus-next'
    })
  })

  // Why: these act on the main window's project; from a side they must do nothing.
  it('never lets main-window workspace chords out of the side', () => {
    expect(resolve(key('Backspace', 'Backspace', { meta: true, shift: true }))).toBeNull()
    expect(resolve(key('KeyN', 'n', { meta: true }))).toBeNull()
    expect(resolve(key('KeyP', 'p', { meta: true }))).toBeNull()
    expect(resolve(key('ArrowLeft', 'ArrowLeft', { meta: true, alt: true }))).toBeNull()
  })

  it('ignores held keys for actions that would repeat', () => {
    const held = { ...key('KeyW', 'w', { meta: true }), isAutoRepeat: true }
    expect(resolve(held)).toBeNull()
  })

  it('sends page keys back into the side and split keys to the main window', () => {
    const guest = Object.assign(new EventEmitter(), { send: vi.fn() })
    const sendToMain = vi.fn()
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the handler reads only events and send().
    attachResearchSideShortcuts(guest as never, { platform: 'darwin', sendToMain })
    const press = (input: ReturnType<typeof key>): boolean => {
      let prevented = false
      guest.emit('before-input-event', { preventDefault: () => (prevented = true) }, input)
      return prevented
    }

    expect(press(key('Digit2', '2', { meta: true }))).toBe(true)
    expect(guest.send).toHaveBeenCalledWith('researchWindow:showPage', 'research-experiments')
    expect(press(key('KeyW', 'w', { meta: true }))).toBe(true)
    expect(sendToMain).toHaveBeenCalledWith({ kind: 'close' })
    expect(press(key('KeyN', 'n', { meta: true }))).toBe(false)
    expect(sendToMain).toHaveBeenCalledTimes(1)
  })
})
