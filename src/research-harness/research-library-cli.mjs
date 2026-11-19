import { requestLibraryPaper } from './research-library-requests.mjs'

function paperLabel(request) {
  if (request.arxivId) {
    return `arXiv:${request.arxivId}`
  }
  if (request.doi) {
    return `DOI ${request.doi}`
  }
  return request.title ? `"${request.title}"` : request.url
}

export const commands = {
  'library add': {
    spec: {
      values: ['--arxiv', '--doi', '--url', '--title', '--authors', '--year', '--why']
    },
    run: ({ project, options }) =>
      requestLibraryPaper(project, {
        arxiv: options['--arxiv'],
        doi: options['--doi'],
        url: options['--url'],
        title: options['--title'],
        authors: options['--authors'],
        year: options['--year'],
        why: options['--why']
      })
  }
}

export const textOutput = {
  'library add': ({ request }) =>
    [
      `Asked Aster to add ${paperLabel(request)} to the project Library (${request.id}).`,
      'Aster asks the person in this chat, or adds it with its PDF at once when they chose to add',
      'papers automatically. Do not download the PDF or edit the bibliography for this yourself.'
    ].join('\n')
}

export const usage = `
Library (the project's papers; the person decides what goes in)
  library add (--arxiv ID|LINK | --doi DOI | --url LINK | --title T [--authors A] [--year Y])
              [--why TEXT]
                                         Ask Aster to add a paper to the project Library. Aster
                                         asks the person in this chat, or adds it with metadata
                                         and PDF at once when they chose that. --why says why the
                                         paper matters (e.g. "closest prior method").
`
