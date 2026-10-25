import { describe, expect, it } from 'vitest'
import {
  findPaperIdentifiers,
  pdfDateYear,
  titleFromFirstPage,
  usablePdfInfoAuthors,
  usablePdfInfoTitle,
  type PdfTextRun
} from './research-library-pdf-title'

function run(str: string, size: number, x: number, y: number): PdfTextRun {
  return { str, transform: [size, 0, 0, size, x, y] }
}

describe('PDF title heuristics', () => {
  it('trusts a real Title entry but not placeholders or file names', () => {
    expect(usablePdfInfoTitle('Attention Is All You Need', 'nips17')).toBe(
      'Attention Is All You Need'
    )
    expect(usablePdfInfoTitle('Microsoft Word - draft_v3.docx', 'x')).toBeNull()
    expect(usablePdfInfoTitle('main.pdf', 'main')).toBeNull()
    expect(usablePdfInfoTitle('paper_final_v2', 'other')).toBeNull()
    expect(
      usablePdfInfoTitle('Attention Is All You Need (copy)', 'Attention_Is_All_You_Need (copy)')
    ).toBeNull()
    expect(usablePdfInfoTitle(undefined, 'x')).toBeNull()
  })

  it('reads the largest text near the top of page 1 across its lines', () => {
    const runs = [
      run('Preprint. Under review.', 9, 72, 760),
      run('Low-Rank Adapters for Small Sentiment Classifiers: A Synthetic', 17, 100, 700),
      run('Demo', 17, 280, 680),
      run('Aster Research Demo', 12, 240, 640),
      run('1', 17, 300, 40),
      { str: 'arXiv:2410.12345v2 [cs.CL] 6 Dec 2026', transform: [0, 20, -20, 0, 30, 400] }
    ]
    expect(titleFromFirstPage(runs, 792)).toBe(
      'Low-Rank Adapters for Small Sentiment Classifiers: A Synthetic Demo'
    )
  })

  it('skips a large logo letter and rejoins a hyphenated line break', () => {
    const runs = [
      run('S', 40, 72, 740),
      run('Self-Super-', 16, 100, 700),
      run('vised Learning at Scale', 16, 100, 682)
    ]
    expect(titleFromFirstPage(runs, 792)).toBe('Self-Supervised Learning at Scale')
  })

  it('reads authors and the creation year from the metadata', () => {
    expect(usablePdfInfoAuthors('Ashish Vaswani; Noam Shazeer')).toBe(
      'Ashish Vaswani; Noam Shazeer'
    )
    expect(usablePdfInfoAuthors('Administrator')).toBeNull()
    expect(pdfDateYear("D:20170612034710Z00'00'")).toBe(2017)
    expect(pdfDateYear('garbage')).toBeNull()
  })

  it('finds the arXiv stamp and a DOI, and maps an arXiv DOI to its ID', () => {
    expect(
      findPaperIdentifiers(
        'arXiv:1706.03762v7 [cs.CL] 6 Dec 2017 … https://doi.org/10.1145/3292500.3330701.'
      )
    ).toEqual({ arxivId: '1706.03762v7', doi: '10.1145/3292500.3330701' })
    expect(findPaperIdentifiers('DOI: 10.48550/arXiv.2410.12345')).toEqual({
      arxivId: '2410.12345',
      doi: '10.48550/arXiv.2410.12345'
    })
    expect(findPaperIdentifiers('no identifiers here')).toEqual({ arxivId: null, doi: null })
    expect(findPaperIdentifiers('Results. References [1] DistilBERT. arXiv:1910.01108')).toEqual({
      arxivId: null,
      doi: null
    })
  })
})
