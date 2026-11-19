import { integerOption } from './research-cli-arguments.mjs'
import { searchPapers } from './research-papers-search.mjs'

export const commands = {
  'papers search': {
    spec: { values: ['--max', '--before'], positionals: 1 },
    run: ({ project, options, positionals }) =>
      searchPapers(project, positionals[0], {
        max: integerOption(options, '--max') ?? 10,
        before: options['--before'] ?? null
      })
  }
}

function paperLine(paper, index) {
  const authors = paper.authors.length > 2 ? `${paper.authors[0]} et al.` : paper.authors.join(', ')
  return [
    `${index + 1}. arXiv ${paper.arxiv} (${paper.published ?? '?'}) ${paper.title}${paper.inLibrary ? ` [in Library: ${paper.inLibrary}]` : ''}`,
    `   ${authors}${authors.endsWith('.') ? '' : '.'} ${paper.summary}`
  ].join('\n')
}

export const textOutput = {
  'papers search': (result) =>
    result.results.length
      ? [
          `arXiv, most relevant first (terms: ${result.terms.join(' ')}${result.before ? `; before ${result.before}` : ''}):`,
          ...result.results.map(paperLine),
          'Record the papers you use as {"title","arxiv"} (plan.baselineSearch.closest for the closest prior methods).'
        ].join('\n')
      : `No arXiv results for ${result.terms.join(' ')}. Try fewer or other words: the method family, the problem, a known method's name.`
}

export const usage = `
Papers (arXiv metadata and abstracts; record what you use as arXiv id + title)
  papers search "QUERY" [--max N] [--before YYYY-MM-DD]
                                         Search arXiv by relevance: every word must match; quote
                                         "a phrase". Marks results already in the project Library
`
