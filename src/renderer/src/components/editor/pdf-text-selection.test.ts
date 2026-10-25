// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest'
import { extractPdfTextSelection } from './pdf-text-selection'

function select(start: Node, end: Node, endOffset: number): Selection | null {
  const range = document.createRange()
  range.setStart(start, 0)
  range.setEnd(end, endOffset)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  return selection
}

afterEach(() => {
  window.getSelection()?.removeAllRanges()
  document.body.replaceChildren()
})

describe('PDF text selection', () => {
  it('extracts the selected text with its PDF page number', () => {
    const root = document.createElement('div')
    root.innerHTML =
      '<div class="page" data-page-number="3"><div class="textLayer"><span>Revise this sentence.</span></div></div>'
    document.body.append(root)
    const text = root.querySelector('span')?.firstChild
    expect(text).toBeTruthy()
    const selection = select(text!, text!, 11)

    expect(extractPdfTextSelection(root, selection)).toEqual({
      text: 'Revise this',
      pageNumber: 3,
      anchor: { x: 0, y: 0 }
    })
  })

  it('rejects chrome, cross-page selections, and text outside the viewer', () => {
    const root = document.createElement('div')
    root.innerHTML =
      '<div class="page" data-page-number="1"><div class="textLayer"><span>First page</span></div></div><div class="page" data-page-number="2"><div class="textLayer"><span>Second page</span></div></div><button>Compile PDF</button>'
    document.body.append(root)
    const spans = root.querySelectorAll('span')
    expect(
      extractPdfTextSelection(root, select(spans[0].firstChild!, spans[1].firstChild!, 6))
    ).toBeNull()
    const button = root.querySelector('button')?.firstChild
    expect(extractPdfTextSelection(root, select(button!, button!, 7))).toBeNull()
    const other = document.body.appendChild(document.createElement('span'))
    other.textContent = 'Outside'
    expect(
      extractPdfTextSelection(root, select(other.firstChild!, other.firstChild!, 7))
    ).toBeNull()
  })
})
