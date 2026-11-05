// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeChatMarkdown } from './NativeChatMarkdown'
import { NativeChatPacedMarkdown } from './NativeChatPacedMarkdown'
import {
  NativeChatReplyRevealsContext,
  type NativeChatReplyReveals
} from './native-chat-reply-reveals'

vi.mock('@/hooks/usePrefersReducedMotion', () => ({ usePrefersReducedMotion: () => false }))

const reveals: NativeChatReplyReveals = { begun: new Set(['reply']), drawn: new Map() }

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  reveals.drawn.clear()
})

function renderReply(content: string, math = true): HTMLElement {
  return render(<NativeChatMarkdown content={content} variant="document" math={math} />).container
}

/** The TeX KaTeX typeset, read back from the MathML it keeps for screen readers. */
function typeset(root: ParentNode): string[] {
  return Array.from(
    root.querySelectorAll('.katex annotation[encoding="application/x-tex"]'),
    (node) => node.textContent ?? ''
  )
}

/** The text a reader sees: KaTeX's MathML copy is hidden. */
function visibleText(root: Element | null): string {
  const copy = root?.cloneNode(true)
  if (!(copy instanceof Element)) {
    return ''
  }
  copy.querySelectorAll('.katex-mathml').forEach((node) => node.remove())
  return copy.textContent ?? ''
}

function displays(root: ParentNode): string[] {
  return Array.from(root.querySelectorAll('.katex-display'), typeset).flat()
}

describe('native chat math', () => {
  it('typesets $…$ and \\(…\\) inline, within their sentence', () => {
    const root = renderReply('Euler: $e^{i\\pi} + 1 = 0$, and \\(x_i \\le 1\\) too.')
    expect(typeset(root)).toEqual(['e^{i\\pi} + 1 = 0', 'x_i \\le 1'])
    expect(displays(root)).toEqual([])
    const paragraph = root.querySelector('p')
    expect(visibleText(paragraph)).toMatch(/^Euler: e.+, and x.+ too\.$/)
    expect(paragraph?.querySelectorAll('.katex')).toHaveLength(2)
  })

  it('typesets $$…$$ and \\[…\\] as display math, on their own lines or in a paragraph', () => {
    const root = renderReply(
      [
        'Block:',
        '',
        '$$',
        '\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}',
        '$$',
        '',
        '\\[',
        'a^2 + b^2 = c^2',
        '\\]',
        '',
        'Inline display $$E = mc^2$$ splits its paragraph.',
        '',
        '\\[ \\int_0^1 x\\,dx \\]'
      ].join('\n')
    )
    expect(displays(root)).toEqual([
      '\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}',
      'a^2 + b^2 = c^2',
      'E = mc^2',
      '\\int_0^1 x\\,dx'
    ])
    const paragraphs = Array.from(root.querySelectorAll('p'), (node) => node.textContent)
    expect(paragraphs).toEqual(['Block:', 'Inline display', 'splits its paragraph.'])
    expect(visibleText(root)).not.toMatch(/\$\$|\\\[|\\\]|\\sum/)
  })

  it('typesets multi-line display math inside a list item', () => {
    const root = renderReply('1. First:\n   \\[\n   x = 1 \\\\\n   y = 2\n   \\]\n2. Second')
    const items = root.querySelectorAll('li')
    expect(items).toHaveLength(2)
    expect(displays(items[0])).toEqual(['x = 1 \\\\\ny = 2'])
    expect(items[1].textContent).toBe('Second')
  })

  it('keeps math delimiters in code spans and fences literal', () => {
    const root = renderReply('Run `echo $x$ \\(y\\)`.\n\n```sh\necho "$$a$$" \\[b\\]\n```')
    expect(root.querySelector('.katex')).toBeNull()
    expect(root.querySelector('p code')?.textContent).toBe('echo $x$ \\(y\\)')
    expect(root.querySelector('pre')?.textContent).toContain('echo "$$a$$" \\[b\\]')
  })

  it('leaves dollar amounts and escaped dollars as text', () => {
    const root = renderReply('It costs $5 and $10, or \\$x\\$ with the escape.')
    expect(root.querySelector('.katex')).toBeNull()
    expect(root.textContent).toBe('It costs $5 and $10, or $x$ with the escape.')
  })

  it('shows invalid TeX as its source instead of throwing', () => {
    const root = renderReply('Broken: $\\frac{1}{$ and $\\notacommand{x}$ here.')
    const error = root.querySelector<HTMLElement>('.katex-error')
    expect(error?.textContent).toBe('\\frac{1}{')
    expect(error?.title).toMatch(/^ParseError/)
    expect(error?.style.color).toBe('var(--destructive)')
    // An unknown command is drawn as its name, in the same color, inside otherwise typeset math.
    const unknown = Array.from(root.querySelectorAll<HTMLElement>('.katex-html [style]')).find(
      (node) => node.textContent === '\\notacommand'
    )
    expect(unknown?.style.color).toBe('var(--destructive)')
    expect(visibleText(root)).toBe('Broken: \\frac{1}{ and \\notacommandx here.')
  })

  it('keeps KaTeX markup through sanitize and draws it in the text color', () => {
    // Raw HTML sends the reply through rehype-raw and sanitize before KaTeX runs.
    const root = renderReply('Root <sub>2</sub> of $\\sqrt{x}$')
    expect(root.querySelector('sub')?.textContent).toBe('2')
    expect(root.querySelector('.katex math')).not.toBeNull()
    expect(root.querySelector('.katex-html [style]')).not.toBeNull()
    const styled = Array.from(root.querySelectorAll<HTMLElement>('.katex [style]'))
    expect(styled.some((node) => node.style.color !== '')).toBe(false)
  })

  it('leaves dollars alone where math is off', () => {
    const root = renderReply('Plain $x$ here.', false)
    expect(root.querySelector('.katex')).toBeNull()
    expect(root.textContent).toBe('Plain $x$ here.')
  })

  it('settles display math that arrives while the reply streams', () => {
    const intro = 'Intro paragraph with $x$.\n\n'
    const reply = (content: string, streaming: boolean) => (
      <NativeChatMarkdown
        content={content}
        variant="document"
        math
        streaming={streaming}
        growing={streaming}
        fadeWords={streaming}
      />
    )
    const view = render(reply(`${intro}$$\na = \\frac{1}{`, true))
    expect(visibleText(view.container.querySelector('p'))).toBe('Intro paragraph with x.')
    expect(displays(view.container)).toEqual([])
    expect(view.container.querySelector('.katex-error')).toBeNull()
    expect(visibleText(view.container)).toBe('Intro paragraph with x.')

    view.rerender(reply(`${intro}$$\na = \\frac{1}{2}\n$$\n\nAfter`, true))
    expect(displays(view.container)).toEqual(['a = \\frac{1}{2}'])
    // Words are wrapped for the fade before KaTeX runs, so its text stays its own.
    expect(view.container.querySelector('.katex [data-word-group]')).toBeNull()
    expect(visibleText(view.container)).toContain('After')

    view.rerender(reply(`${intro}$$\na = \\frac{1}{2}\n$$\n\nAfter all.`, false))
    expect(displays(view.container)).toEqual(['a = \\frac{1}{2}'])
    expect(typeset(view.container)).toEqual(['x', 'a = \\frac{1}{2}'])
  })

  it('never shows half-written display math while a paced reply is revealed', () => {
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance'
      ]
    })
    const content = 'Before.\n\n\\[\n\\int_0^1 x^2\\,dx = \\frac{1}{3}\n\\]\n\nAfter the math.'
    const reply = (text: string, streaming: boolean) => (
      <NativeChatReplyRevealsContext.Provider value={reveals}>
        <NativeChatPacedMarkdown
          rowKey="reply"
          content={text}
          streaming={streaming}
          variant="document"
          math
        />
      </NativeChatReplyRevealsContext.Provider>
    )
    const view = render(reply('', true))
    let typesetWhileStreaming = false
    for (let length = 1; length <= content.length; length += 3) {
      view.rerender(reply(content.slice(0, length), true))
      act(() => vi.advanceTimersByTime(100))
      const root = view.container
      expect(root.querySelector('.katex-error')).toBeNull()
      expect(visibleText(root)).not.toMatch(/\\\[|\\int|\$\$|\\$/)
      typesetWhileStreaming ||= displays(root).length > 0
    }
    expect(typesetWhileStreaming).toBe(true)
    view.rerender(reply(content, false))
    act(() => vi.advanceTimersByTime(5000))
    expect(displays(view.container)).toEqual(['\\int_0^1 x^2\\,dx = \\frac{1}{3}'])
    expect(visibleText(view.container)).toMatch(/^Before\..+After the math\.$/s)
  })
})
