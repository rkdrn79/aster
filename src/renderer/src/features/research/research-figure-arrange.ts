/** Excalidraw's own arrange actions, reached through their keyboard shortcuts. */
export type ArrangeShortcut = {
  key: string
  code?: string
  mod?: boolean
  shift?: boolean
  alt?: boolean
}

export type ArrangeEntry = {
  label: string
  shortcut: ArrangeShortcut
  /** False when the Figures page took the chord for itself (⌘⇧G Generate, ⌘⇧L Use in paper). */
  hint?: false
  /** How many selected items (groups count as one) the action needs; 1 when absent. */
  min?: number
}

const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform)
const ARROWS: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓'
}
const front = isMac ? { alt: true } : { shift: true }

export const ARRANGE: readonly (readonly ArrangeEntry[])[] = [
  [
    { label: 'Align left', shortcut: { key: 'ArrowLeft', mod: true, shift: true }, min: 2 },
    { label: 'Align right', shortcut: { key: 'ArrowRight', mod: true, shift: true }, min: 2 },
    { label: 'Align top', shortcut: { key: 'ArrowUp', mod: true, shift: true }, min: 2 },
    { label: 'Align bottom', shortcut: { key: 'ArrowDown', mod: true, shift: true }, min: 2 },
    {
      label: 'Distribute horizontally',
      shortcut: { key: 'h', code: 'KeyH', alt: true },
      min: 3
    },
    { label: 'Distribute vertically', shortcut: { key: 'v', code: 'KeyV', alt: true }, min: 3 }
  ],
  [
    { label: 'Group', shortcut: { key: 'g', mod: true }, min: 2 },
    { label: 'Ungroup', shortcut: { key: 'G', code: 'KeyG', mod: true, shift: true }, hint: false },
    { label: 'Duplicate', shortcut: { key: 'd', mod: true } },
    {
      label: 'Lock or unlock',
      shortcut: { key: 'l', code: 'KeyL', mod: true, shift: true },
      hint: false
    }
  ],
  [
    { label: 'Bring to front', shortcut: { key: ']', code: 'BracketRight', mod: true, ...front } },
    { label: 'Send to back', shortcut: { key: '[', code: 'BracketLeft', mod: true, ...front } },
    { label: 'Copy style', shortcut: { key: 'c', code: 'KeyC', mod: true, alt: true } },
    { label: 'Paste style', shortcut: { key: 'v', code: 'KeyV', mod: true, alt: true } }
  ]
]

export function shortcutHint(entry: ArrangeEntry): string {
  if (entry.hint === false) {
    return ''
  }
  const { shortcut } = entry
  const key = ARROWS[shortcut.key] ?? shortcut.key.toUpperCase()
  const parts = [
    shortcut.mod ? (isMac ? '⌘' : 'Ctrl') : '',
    shortcut.alt ? (isMac ? '⌥' : 'Alt') : '',
    shortcut.shift ? (isMac ? '⇧' : 'Shift') : '',
    key
  ].filter(Boolean)
  return isMac ? parts.join('') : parts.join('+')
}

/** Sends a shortcut to the Excalidraw container, so its own action runs with undo and bindings. */
export function sendArrangeShortcut(container: Element | null, shortcut: ArrangeShortcut): void {
  container?.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: shortcut.key,
      code: shortcut.code ?? '',
      metaKey: Boolean(shortcut.mod) && isMac,
      ctrlKey: Boolean(shortcut.mod) && !isMac,
      shiftKey: Boolean(shortcut.shift),
      altKey: Boolean(shortcut.alt),
      bubbles: true,
      cancelable: true
    })
  )
}
