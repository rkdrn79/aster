import { describe, expect, it } from 'vitest'
import {
  figureSceneReplacing,
  onFigureSceneReplaced,
  replaceFigureScene
} from './research-figure-scene-replace'

describe('replaceFigureScene', () => {
  it('marks the canvas as replacing only while the update runs, then tells listeners', () => {
    const api = {}
    const seen: string[] = []
    const off = onFigureSceneReplaced(api, () => seen.push(`after:${figureSceneReplacing(api)}`))
    replaceFigureScene(api, () => seen.push(`during:${figureSceneReplacing(api)}`))
    expect(seen).toEqual(['during:true', 'after:false'])
    off()
    replaceFigureScene(api, () => undefined)
    expect(seen).toHaveLength(2)
  })

  it('keeps each canvas apart and clears the mark when the update throws', () => {
    const one = {}
    const two = {}
    let heard = 0
    onFigureSceneReplaced(two, () => (heard += 1))
    expect(() =>
      replaceFigureScene(one, () => {
        throw new Error('bad scene')
      })
    ).toThrow('bad scene')
    expect(figureSceneReplacing(one)).toBe(false)
    expect(heard).toBe(0)
  })
})
