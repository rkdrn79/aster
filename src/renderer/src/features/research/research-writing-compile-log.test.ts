import { describe, expect, it } from 'vitest'
import {
  appendCompileLog,
  compileLogProblems,
  compileSourcePath,
  compileStatusText
} from './research-writing-compile-log'

describe('Writing build progress', () => {
  it('reads the latest Tectonic note as the build status', () => {
    expect(compileStatusText('')).toBe('Starting Tectonic…')
    expect(
      compileStatusText(
        'note: connecting to https://relay.fullyjustified.net/default_bundle_v33.tar\nnote: downloading article.cls\n'
      )
    ).toBe('Downloading TeX packages (one-time)…')
    expect(compileStatusText('note: downloading size10.clo\nnote: Running TeX ...\n')).toBe(
      'Typesetting…'
    )
    expect(compileStatusText('note: Rerunning TeX because "main.aux" changed ...\n')).toBe(
      'Typesetting again…'
    )
    expect(compileStatusText('note: Running xdvipdfmx ...\nnote: Writing `main.pdf`\n')).toBe(
      'Writing the PDF…'
    )
  })

  it('links located errors to project-relative TeX files, errors before warnings', () => {
    const log = [
      'note: Running TeX ...',
      'warning: main.tex:7: Overfull \\hbox (2.0pt too wide) in paragraph',
      'error: sections/intro.tex:3: Undefined control sequence',
      'error: sections/intro.tex:3: Undefined control sequence',
      'error: the XeTeX engine had an unrecoverable error'
    ].join('\n')
    expect(compileLogProblems(log, 'paper/main.tex')).toEqual([
      {
        severity: 'error',
        sourcePath: 'paper/sections/intro.tex',
        file: 'sections/intro.tex',
        line: 3,
        message: 'Undefined control sequence'
      },
      {
        severity: 'warning',
        sourcePath: 'paper/main.tex',
        file: 'main.tex',
        line: 7,
        message: 'Overfull \\hbox (2.0pt too wide) in paragraph'
      }
    ])
  })

  it('maps engine paths from the main file folder and refuses ones outside the project', () => {
    expect(compileSourcePath('main.tex', 'main.tex')).toBe('main.tex')
    expect(compileSourcePath('paper/main.tex', '../shared/macros.tex')).toBe('shared/macros.tex')
    expect(compileSourcePath('main.tex', '../outside.tex')).toBeNull()
    expect(compileSourcePath('paper/main.tex', '/usr/share/texmf/article.cls')).toBeNull()
  })

  it('keeps the newest output when the log grows past its cap', () => {
    const log = appendCompileLog('a'.repeat(499_999), 'bc')
    expect(log).toHaveLength(500_000)
    expect(log.endsWith('bc')).toBe(true)
  })
})
