import { describe, expect, it } from 'vitest'
import { arxivPdfFileName, parseArxivAtomFeed, parseArxivReference } from './research-library-arxiv'

describe('parseArxivReference', () => {
  it.each([
    ['2410.12345', '2410.12345'],
    ['arXiv:2410.12345v2', '2410.12345v2'],
    ['https://arxiv.org/abs/2410.12345v2', '2410.12345v2'],
    ['https://arxiv.org/pdf/2410.12345.pdf', '2410.12345'],
    ['https://www.alphaxiv.org/overview/2410.12345', '2410.12345'],
    ['https://huggingface.co/papers/2410.12345', '2410.12345'],
    ['https://arxiv.org/abs/hep-th/9901001v1', 'hep-th/9901001v1'],
    ['math.GT/0309136', 'math.GT/0309136']
  ])('reads %s', (input, expected) => {
    expect(parseArxivReference(input)).toBe(expected)
  })

  it.each(['', 'not a paper', 'https://example.com/abs/2410.12345', '10.1145/1234567'])(
    'rejects %s',
    (input) => {
      expect(parseArxivReference(input)).toBeNull()
    }
  )

  it('keeps old-style IDs safe as file names', () => {
    expect(arxivPdfFileName('hep-th/9901001v1')).toBe('hep-th_9901001v1.pdf')
  })
})

describe('parseArxivAtomFeed', () => {
  it('reads one paper entry', () => {
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <id>http://arxiv.org/abs/1706.03762v7</id>
        <published>2017-06-12T17:57:34Z</published>
        <title>Attention Is All
          You Need</title>
        <summary>  The dominant &amp; sequence models.
        </summary>
        <author><name>Ashish Vaswani</name></author>
        <author><name>Noam Shazeer</name></author>
        <arxiv:doi xmlns:arxiv="http://arxiv.org/schemas/atom">10.48550/arXiv.1706.03762</arxiv:doi>
        <link href="http://arxiv.org/abs/1706.03762v7" rel="alternate" type="text/html"/>
        <link title="pdf" href="http://arxiv.org/pdf/1706.03762v7" rel="related" type="application/pdf"/>
        <arxiv:primary_category xmlns:arxiv="http://arxiv.org/schemas/atom" term="cs.CL" scheme="http://arxiv.org/schemas/atom"/>
      </entry></feed>`
    expect(parseArxivAtomFeed(xml)).toEqual({
      arxivId: '1706.03762v7',
      title: 'Attention Is All You Need',
      authors: ['Ashish Vaswani', 'Noam Shazeer'],
      abstract: 'The dominant & sequence models.',
      published: '2017-06-12T17:57:34Z',
      year: 2017,
      primaryCategory: 'cs.CL',
      doi: '10.48550/arXiv.1706.03762',
      journalRef: null,
      absUrl: 'https://arxiv.org/abs/1706.03762v7',
      pdfUrl: 'https://arxiv.org/pdf/1706.03762v7'
    })
  })

  it('treats API error entries and empty feeds as missing', () => {
    expect(parseArxivAtomFeed('<feed></feed>')).toBeNull()
    expect(
      parseArxivAtomFeed(
        '<feed><entry><id>http://arxiv.org/api/errors#incorrect_id_format_for_x</id><title>Error</title></entry></feed>'
      )
    ).toBeNull()
  })
})
