import { describe, expect, it } from 'vitest'
import { mathInk, texFromDollars, typesetFigureMath } from './research-figure-math'

describe('figure math', () => {
  it('typesets TeX the way the kit does, coloured and sized in scene units', async () => {
    const math = await typesetFigureMath('f_\\theta', 16, '#0070b8')
    expect(math.fileId).toMatch(/^aster-tex-[0-9a-f]{16}$/)
    expect(math.width).toBeGreaterThan(10)
    expect(math.height).toBeGreaterThan(12)
    expect(math.ascent).toBeGreaterThan(0)
    expect(mathInk(math.dataURL)).toBe('#0070b8')
    const bigger = await typesetFigureMath('f_\\theta', 32, '#0070b8')
    expect(bigger.height).toBeCloseTo(math.height * 2, 1)
  })

  it('reports TeX errors instead of drawing them', async () => {
    await expect(typesetFigureMath('\\frac{a', 16, '#000')).rejects.toThrow(/^TeX error:/)
    await expect(typesetFigureMath('  ', 16, '#000')).rejects.toThrow(/^TeX error:/)
  })

  it('reads $…$ in typed text as TeX, words upright', () => {
    expect(texFromDollars('$\\mathcal{L}_2$')).toBe('\\mathcal{L}_2')
    expect(texFromDollars('loss $L_2$ term')).toBe('\\text{loss }L_2\\text{ term}')
    expect(texFromDollars('no math here')).toBeNull()
  })
})
