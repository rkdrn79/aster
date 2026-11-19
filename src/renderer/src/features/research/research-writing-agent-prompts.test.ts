import { describe, expect, it } from 'vitest'
import { splitAsterContext } from '../../../../shared/aster-context-block'
import {
  buildWritingAgentFileEditPrompt,
  buildWritingMessageContext,
  buildWritingQuickPrompt,
  buildWritingSkeletonConfirmedPrompt,
  WRITING_GUIDE_LINE,
  type WritingFixFinding,
  type WritingPromptContext
} from './research-writing-agent-prompts'
import { buildWritingPdfRevisionPrompt } from './research-writing-pdf-agent-send'

const context: WritingPromptContext = {
  projectPath: '/work/proj',
  manuscriptPath: '/work/proj/paper/main.tex'
}

const selection = {
  filePath: '/work/proj/paper/main.tex',
  relativePath: 'paper/main.tex',
  startLine: 40,
  startColumn: 1,
  endLine: 44,
  endColumn: 12,
  selectedText: 'This design ensures robust performance across various settings.'
}

function parts(prompt: string): { request: string; body: string; label: string } {
  const split = splitAsterContext(prompt)
  expect(split?.contexts).toHaveLength(1)
  return {
    request: split?.request ?? '',
    body: split?.contexts[0]?.body ?? '',
    label: split?.contexts[0]?.label ?? ''
  }
}

function finding(code: string, severity: 'error' | 'warning', line: number): WritingFixFinding {
  return {
    code,
    id: null,
    message: `${code} message`,
    fix: 'Add the scope.',
    file: 'paper/main.tex',
    line,
    column: 3,
    span: 'state-of-the-art',
    paragraph: 2,
    severity
  }
}

describe('Writing agent prompts', () => {
  it('make every quick action read the Writing guide before anything else it says', () => {
    const requests = [
      { kind: 'method-from-code', folders: ['src', 'models/core'] },
      { kind: 'intro-from-skeleton' },
      { kind: 'results-from-runs' },
      { kind: 'tighten', selection },
      { kind: 'check-fix', findings: [finding('WC-CITE-KEY', 'error', 52)], total: 1 }
    ] as const
    for (const request of requests) {
      const { body } = parts(buildWritingQuickPrompt(context, request))
      expect(body).toContain(WRITING_GUIDE_LINE)
      expect(body.indexOf('aster skills get aster-research-track --section Writing')).toBeLessThan(
        body.indexOf('node H/cli.mjs writing check')
      )
      expect(body).toContain('\\cite{TODO:')
      expect(body).toContain("Never credit the person's method")
    }
  })

  it('send code to method through writing context, the manifest and a skeleton to confirm', () => {
    const { request, body, label } = parts(
      buildWritingQuickPrompt(context, {
        kind: 'method-from-code',
        folders: ['src', 'models/core']
      })
    )
    expect(request).toBe('Write the method section from the code in src, models/core.')
    expect(label).toBe('Writing method')
    expect(body).toContain('node H/cli.mjs writing context --code "src" --code "models/core"')
    expect(body).toContain('code manifest')
    expect(body).toContain('which parts are mine and which are borrowed')
    expect(body).toContain('writing skeleton set --section method --file -')
    expect(body).toContain('writing check --file "/work/proj/paper/main.tex" --section method')
  })

  it('gate the introduction on its skeleton and results on claims', () => {
    const intro = parts(buildWritingQuickPrompt(context, { kind: 'intro-from-skeleton' })).body
    expect(intro).toContain('writing skeleton get --section intro')
    expect(intro).toContain('Draft: ask me to confirm it on the Writing page and stop')
    const results = parts(buildWritingQuickPrompt(context, { kind: 'results-from-runs' })).body
    expect(results).toContain('node H/cli.mjs context')
    expect(results).toContain('node H/cli.mjs claim list')
    expect(results).toContain('writing skeleton set --section experiments')
    expect(results).toContain('`claim add`')
  })

  it('quote the selection to tighten and keep the edit inside it', () => {
    const { request, body } = parts(
      buildWritingQuickPrompt(context, { kind: 'tighten', selection })
    )
    expect(request).toBe('Tighten the selected passage (paper/main.tex:40–44).')
    expect(body).toContain(selection.selectedText)
    expect(body).toContain('Edit only this passage')
    expect(body).toContain('10–20% shorter')
    expect(body).toContain('writing check --file "/work/proj/paper/main.tex"`')
  })

  it('list the findings to fix, errors marked, and bound the list', () => {
    const findings = Array.from({ length: 45 }, (_, index) =>
      finding(index ? 'WC-SUPERLATIVE' : 'WC-CITE-KEY', index ? 'warning' : 'error', index + 1)
    )
    const { request, body } = parts(
      buildWritingQuickPrompt(context, { kind: 'check-fix', findings, total: 45 })
    )
    expect(request).toBe('Fix the writing check findings (45 listed by the check).')
    expect(body).toContain(
      '- ERROR WC-CITE-KEY paper/main.tex:1 "state-of-the-art": WC-CITE-KEY message Fix: Add the scope.'
    )
    expect(body).toContain('- warning WC-SUPERLATIVE paper/main.tex:2')
    expect(body).not.toContain('paper/main.tex:41 ')
    expect(body).toContain('… and 5 more')
  })

  it('tell the agent to draft once the person confirms a skeleton', () => {
    const { request, body } = parts(
      buildWritingSkeletonConfirmedPrompt(context, {
        section: 'intro',
        path: '.aster/writing/intro.skeleton.md'
      })
    )
    expect(request).toBe('I confirmed the introduction skeleton. Draft the introduction from it.')
    expect(body).toContain('".aster/writing/intro.skeleton.md"')
    expect(body).toContain('writing skeleton get --section intro')
    expect(body).toContain('writing check --file "/work/proj/paper/main.tex" --section intro')
  })

  it('give typed messages the guide and the manuscript, keyed by the manuscript', () => {
    const message = buildWritingMessageContext(context)
    expect(message.key).toBe('/work/proj|/work/proj/paper/main.tex')
    expect(message.body).toContain(WRITING_GUIDE_LINE)
    expect(message.body).toContain('"/work/proj/paper/main.tex"')
    expect(buildWritingMessageContext({ ...context, manuscriptPath: null }).body).toContain(
      'the main .tex file named in .aster/project.json'
    )
  })

  it('start selection and PDF revisions with the guide line too', () => {
    const edit = parts(buildWritingAgentFileEditPrompt(selection, 'Shorter.')).body
    expect(edit.startsWith(WRITING_GUIDE_LINE)).toBe(true)
    expect(edit).toContain('replace only that passage')
    const pdf = parts(
      buildWritingPdfRevisionPrompt(
        {
          workspaceId: 'w1',
          workspacePath: '/work/proj',
          pdfFile: { absolutePath: '/work/proj/paper/main.pdf', relativePath: 'paper/main.pdf' },
          mainTeXFile: { absolutePath: '/work/proj/paper/main.tex', relativePath: 'paper/main.tex' }
        },
        { text: 'A sentence.', pageNumber: 2, anchor: { x: 0, y: 0 } },
        'Shorter.'
      )
    ).body
    expect(pdf.startsWith(WRITING_GUIDE_LINE)).toBe(true)
  })
})

describe('grounding and length', () => {
  it('every drafting prompt asks for sourced facts, counted claims and a length budget', () => {
    const prompts = [
      buildWritingQuickPrompt(context, { kind: 'intro-from-skeleton' }),
      buildWritingQuickPrompt(context, { kind: 'results-from-runs' }),
      buildWritingQuickPrompt(context, { kind: 'method-from-code', folders: ['src'] }),
      buildWritingSkeletonConfirmedPrompt(context, {
        section: 'intro',
        path: '.aster/writing/intro.skeleton.md'
      })
    ]
    for (const prompt of prompts) {
      const { body } = parts(prompt)
      expect(body).toContain('Each fact traces to a source you can name')
      expect(body).toContain('counts instead of sweeps')
      expect(body).toContain('Set a length budget before drafting')
      expect(body).toContain('no bold run-in label on every paragraph')
    }
    expect(buildWritingMessageContext(context).body).toContain('Set a length budget')
  })

  it('numbers come from claims, then the manuscript and the data, and never wait for a claim', () => {
    const typed = buildWritingMessageContext(context).body
    expect(typed).toContain(
      "a recorded claim (`node H/cli.mjs claim list`), the manuscript's own tables, figure captions or other sections, or a project data file"
    )
    expect(typed).toContain('instead of holding the number back')
    expect(typed).toContain('Results stay in the experiments')
    const results = parts(buildWritingQuickPrompt(context, { kind: 'results-from-runs' })).body
    expect(results).toContain('a number from a table or data file goes in as printed')
    const method = parts(
      buildWritingQuickPrompt(context, { kind: 'method-from-code', folders: ['src'] })
    ).body
    expect(method).toContain('Measured results stay in the experiments')
  })

  it('a selection edit keeps to the passage and adds no unsourced fact', () => {
    const { body } = parts(buildWritingAgentFileEditPrompt(selection, 'Tighten this.'))
    expect(body).toContain(
      'Add no fact that the passage, the manuscript or a cited source does not contain'
    )
    expect(body).toContain("keep to the passage's length")
  })
})
