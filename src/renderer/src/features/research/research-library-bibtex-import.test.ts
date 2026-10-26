import { describe, expect, it } from 'vitest'
import { readBibtexEntries } from '../../../../shared/research/bibtex-entry-reader'
import { libraryPaperSchema, type LibraryScope } from '../../../../shared/research/research-library'
import { bibtexArxivId, papersFromBibtex } from './research-library-bibtex-import'

const scope: LibraryScope = {
  hostId: 'runtime:vip',
  workspaceId: 'streaming-video',
  workspacePath: '/data/projects/StreamingVideo'
}

describe('project bibliography import', () => {
  it('finds explicit arXiv IDs without guessing from a title or DOI', () => {
    const parsed = readBibtexEntries(
      '@article{one,title={One},journal={arXiv preprint arXiv:2607.13298}}\n' +
        '@article{two,title={Two},eprint={2501.01234}}\n' +
        '@article{three,title={Three},url={https://arxiv.org/abs/2401.12345}}\n' +
        '@article{four,title={Four},doi={10.1234/example}}',
      2000
    )
    expect(parsed.entries.map(bibtexArxivId)).toEqual([
      '2607.13298',
      '2501.01234',
      '2401.12345',
      null
    ])
  })

  it('imports existing BibTeX on an SSH-hosted project without duplicating citations', () => {
    const parsed = readBibtexEntries(
      '@article{one,title={First paper},author={Researcher, Ada},year={2025},url={https://example.org/one}}\n' +
        '@article{two,title={Second paper},year={2026}}',
      2000
    )
    const first = papersFromBibtex(scope, parsed.entries, [], '2026-10-26T00:00:00Z')
    expect(first.map((paper) => paper.bibtexKey)).toEqual(['one', 'two'])
    expect(first.map((paper) => libraryPaperSchema.parse(paper).title)).toEqual([
      'First paper',
      'Second paper'
    ])
    expect(papersFromBibtex(scope, parsed.entries, first, '2026-10-26T00:00:00Z')).toEqual([])
    expect(
      papersFromBibtex(
        { ...scope, hostId: 'runtime:another' },
        parsed.entries,
        first,
        '2026-10-26T00:00:00Z'
      )
    ).toHaveLength(2)
  })
})
