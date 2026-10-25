import {
  buildAccentColorStyleSheet,
  normalizeAccentColor
} from '../../../shared/accent-color-tokens'

const ACCENT_STYLE_ELEMENT_ID = 'aster-accent-color'

/** Keeps one accent override sheet in sync; removing it restores main.css's ink defaults. */
export function applyDocumentAccentColor(accentColor: unknown, doc: Document = document): void {
  const accent = normalizeAccentColor(accentColor)
  const existing = doc.getElementById(ACCENT_STYLE_ELEMENT_ID)
  if (!accent) {
    existing?.remove()
    return
  }
  const style = existing ?? doc.head.appendChild(doc.createElement('style'))
  style.id = ACCENT_STYLE_ELEMENT_ID
  const css = buildAccentColorStyleSheet(accent)
  if (style.textContent !== css) {
    style.textContent = css
  }
}
