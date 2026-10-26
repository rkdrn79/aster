import { describe, expect, it } from 'vitest'
import { readBibtexEntries } from '../../../../shared/research/bibtex-entry-reader'
import { libraryPaperSchema, type LibraryScope } from '../../../../shared/research/research-library'
import { papersFromBibtex } from './research-library-bibtex-import'

const scope: LibraryScope = {
  hostId: 'runtime:vip',
  workspaceId: 'streaming-video',
  workspacePath: '/data/projects/StreamingVideo'
}

describe('project bibliography import', () => {
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
