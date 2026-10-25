import { describe, expect, it } from 'vitest'
import { movedProjectPath } from './research-layout-migration'

const moves = [
  { from: 'research/experiments', to: '.aster/experiments' },
  { from: 'research/manuscript', to: 'paper' },
  { from: 'research/references/papers', to: '.aster/library/papers' }
]

describe('movedProjectPath', () => {
  it('follows a move and keeps absolute paths absolute and relative paths relative', () => {
    expect(
      movedProjectPath(
        '/data/proj',
        '/data/proj/research/experiments/a/runs/r/metrics.jsonl',
        moves
      )
    ).toBe('/data/proj/.aster/experiments/a/runs/r/metrics.jsonl')
    expect(movedProjectPath('/data/proj', 'research/manuscript/main.tex', moves)).toBe(
      'paper/main.tex'
    )
    expect(movedProjectPath('/data/proj', 'research/references/papers/x.pdf', moves)).toBe(
      '.aster/library/papers/x.pdf'
    )
  })

  it('leaves paths outside the moves and outside the project alone', () => {
    expect(movedProjectPath('/data/proj', 'research/experiments-old/x', moves)).toBe(
      'research/experiments-old/x'
    )
    expect(movedProjectPath('/data/proj', '/data/other/research/experiments/a', moves)).toBe(
      '/data/other/research/experiments/a'
    )
    expect(movedProjectPath('/data/proj', 'src/train.py', moves)).toBe('src/train.py')
  })
})
