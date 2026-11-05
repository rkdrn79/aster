import { describe, expect, it } from 'vitest'
import { prepareNativeChatMath } from './native-chat-math-source'

describe('prepareNativeChatMath', () => {
  it('leaves text without math untouched', () => {
    const text = 'Plain words, a [link](https://example.com) and `code`.'
    expect(prepareNativeChatMath(text)).toBe(text)
  })

  it('keeps dollar math as written', () => {
    expect(prepareNativeChatMath('Euler: $e^{i\\pi} + 1 = 0$.')).toBe('Euler: $e^{i\\pi} + 1 = 0$.')
    expect(prepareNativeChatMath('Area $$A = \\pi r^2$$ here')).toBe('Area $$A = \\pi r^2$$ here')
    expect(prepareNativeChatMath('$$\n\\sum_{i=1}^n i\n$$')).toBe('$$\n\\sum_{i=1}^n i\n$$')
  })

  it('rewrites \\( \\) to inline dollars', () => {
    expect(prepareNativeChatMath('where \\(x_i \\le 1\\) holds')).toBe('where $x_i \\le 1$ holds')
  })

  it('rewrites \\[ \\] on one line to double dollars', () => {
    expect(prepareNativeChatMath('\\[ a^2 + b^2 = c^2 \\]')).toBe('$$ a^2 + b^2 = c^2 $$')
  })

  it('gives multi-line \\[ \\] its own $$ lines', () => {
    expect(prepareNativeChatMath('So:\n\\[\nf(x) = \\int_0^x t\\,dt\n\\]\nDone.')).toBe(
      'So:\n$$\nf(x) = \\int_0^x t\\,dt\n$$\nDone.'
    )
    expect(prepareNativeChatMath('We get \\[ a = b \\\\\n c = d \\] here')).toBe(
      'We get\n$$\na = b \\\\\n c = d\n$$\nhere'
    )
  })

  it('moves math off the line of an opening or closing $$', () => {
    expect(prepareNativeChatMath('$$a = 1\nb = 2$$')).toBe('$$\na = 1\nb = 2\n$$')
    expect(prepareNativeChatMath('Then $$\nx\n$$ follows')).toBe('Then\n$$\nx\n$$\nfollows')
  })

  it('keeps display math inside its list item and quote', () => {
    expect(prepareNativeChatMath('1. Step: \\[\n   a = b\n   \\]\n2. Next')).toBe(
      '1. Step:\n   $$\n   a = b\n   $$\n2. Next'
    )
    expect(prepareNativeChatMath('> Quote \\[\n> x\n> \\]')).toBe('> Quote\n> $$\n> x\n> $$')
    expect(prepareNativeChatMath('- item\n  $$\n  x\n  $$')).toBe('- item\n  $$\n  x\n  $$')
  })

  it('leaves code spans and fenced code literal', () => {
    const code = [
      'Run `echo $HOME \\(x\\)` first.',
      '',
      '```sh',
      'echo "$5 and $10" \\[ not math \\]',
      '$$',
      '```',
      '',
      '~~~',
      'price: $3',
      '~~~',
      '',
      '- ```py',
      '  cost = "$4"',
      '  ```'
    ].join('\n')
    expect(prepareNativeChatMath(code)).toBe(code)
  })

  it('escapes dollar amounts so they never pair as math', () => {
    expect(prepareNativeChatMath('It costs $5 and $10 in total.')).toBe(
      'It costs \\$5 and \\$10 in total.'
    )
    expect(prepareNativeChatMath('Between $5 and $x$ apples')).toBe('Between \\$5 and $x$ apples')
    expect(prepareNativeChatMath('A $ 5 fee')).toBe('A \\$ 5 fee')
    expect(prepareNativeChatMath('$x$5')).toBe('\\$x\\$5')
  })

  it('keeps escaped dollars and dollars in bare links as written', () => {
    expect(prepareNativeChatMath('Pay \\$5, not \\$x\\$.')).toBe('Pay \\$5, not \\$x\\$.')
    // An escaped dollar never closes math, so the `$` before it is money too.
    expect(prepareNativeChatMath('From $10 to \\$x\\$')).toBe('From \\$10 to \\$x\\$')
    expect(prepareNativeChatMath('A line break $a \\\\$ in math')).toBe(
      'A line break $a \\\\$ in math'
    )
    expect(prepareNativeChatMath('See https://example.com/$a and $b$')).toBe(
      'See https://example.com/$a and $b$'
    )
  })

  it('keeps unclosed delimiters when the reply is whole', () => {
    expect(prepareNativeChatMath('An open \\[ bracket')).toBe('An open \\[ bracket')
    expect(prepareNativeChatMath('$$\nx = 1')).toBe('$$\nx = 1')
  })

  describe('while the reply is being written', () => {
    it('leaves out display math that has not closed yet', () => {
      expect(prepareNativeChatMath('Intro.\n\n$$\na = \\frac{1}{', true)).toBe('Intro.\n\n')
      expect(prepareNativeChatMath('Intro.\n\n\\[ a = ', true)).toBe('Intro.\n\n')
      expect(prepareNativeChatMath('So $$a + ', true)).toBe('So ')
      expect(prepareNativeChatMath('Intro.\n\n$$\na = 1\n$', true)).toBe('Intro.\n\n')
    })

    it('shows display math once it closes', () => {
      expect(prepareNativeChatMath('Intro.\n\n$$\na = 1\n$$', true)).toBe('Intro.\n\n$$\na = 1\n$$')
      expect(prepareNativeChatMath('Intro.\n\n\\[ a = 1 \\]', true)).toBe('Intro.\n\n$$ a = 1 $$')
    })

    it('holds back a trailing delimiter that may yet open math', () => {
      expect(prepareNativeChatMath('It costs $', true)).toBe('It costs ')
      expect(prepareNativeChatMath('Then \\', true)).toBe('Then ')
    })

    it('keeps showing money and inline math still being written', () => {
      expect(prepareNativeChatMath('It costs $5 and', true)).toBe('It costs \\$5 and')
      expect(prepareNativeChatMath('Let $x^2', true)).toBe('Let \\$x^2')
    })

    it('does not hold back an unclosed $$ in a paragraph that has ended', () => {
      expect(prepareNativeChatMath('A $$ sign\n\nnext', true)).toBe('A $$ sign\n\nnext')
    })

    it('copies code still being written as is, since the stream closes it', () => {
      expect(prepareNativeChatMath('Run `echo $HOME', true)).toBe('Run `echo $HOME')
      expect(prepareNativeChatMath('Run `echo $HOME')).toBe('Run `echo \\$HOME')
    })
  })
})
