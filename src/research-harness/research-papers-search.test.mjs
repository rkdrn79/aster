import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  arxivSearchQuery,
  fetchText,
  parseArxivFeed,
  searchPapers,
  searchTerms
} from './research-papers-search.mjs'

// No test reaches arXiv: searches get a stub feed, and the socket route talks to a local server.
const feed = (...entries) =>
  `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">${entries
    .map(
      ([id, title, published]) => `<entry>
  <id>http://arxiv.org/abs/${id}v2</id>
  <published>${published}T10:00:00Z</published>
  <title>${title}</title>
  <summary>  A method for &amp; about
   time series.  </summary>
  <author><name>Ada Lovelace</name></author><author><name>Alan Turing</name></author>
  <arxiv:doi xmlns:arxiv="http://arxiv.org/schemas/atom">10.1000/x.${id}</arxiv:doi>
</entry>`
    )
    .join('')}</feed>`

async function project() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aster-papers-'))
  await mkdir(path.join(root, '.aster'), { recursive: true })
  await mkdir(path.join(root, 'paper'), { recursive: true })
  await writeFile(
    path.join(root, '.aster', 'project.json'),
    JSON.stringify({ schemaVersion: 1, references: { bibliography: 'paper/references.bib' } })
  )
  await writeFile(
    path.join(root, 'paper', 'references.bib'),
    '@inproceedings{yue2022ts2vec,\n  title={{TS2Vec}: Towards Universal Representation of Time Series},\n  year={2022}\n}\n'
  )
  return root
}

test('queries keep phrases, drop stopwords and AND every term; a date bounds them', () => {
  assert.deepEqual(
    searchTerms('learned augmentations for "time series" contrastive learning, the'),
    ['learned', 'augmentations', '"time series"', 'contrastive', 'learning']
  )
  assert.equal(
    arxivSearchQuery(['adaptive', '"time series"'], { before: '2024-05-22' }),
    'all:adaptive AND all:"time series" AND submittedDate:[190001010000 TO 202405220000]'
  )
  assert.throws(() => arxivSearchQuery(['x'], { before: 'May 2024' }), /--before/u)
})

test('the feed parses into arXiv ids without versions, dates, authors and DOIs', () => {
  const [paper] = parseArxivFeed(
    feed(['2106.10466', 'TS2Vec: Towards Universal Representation of Time Series', '2021-06-19'])
  )
  assert.equal(paper.arxiv, '2106.10466')
  assert.equal(paper.published, '2021-06-19')
  assert.equal(paper.year, 2021)
  assert.deepEqual(paper.authors, ['Ada Lovelace', 'Alan Turing'])
  assert.equal(paper.doi, '10.1000/x.2106.10466')
  assert.equal(paper.summary, 'A method for & about time series.')
})

test('a search marks Library papers and drops terms until something matches', async () => {
  const root = await project()
  const urls = []
  try {
    const result = await searchPapers(root, 'universal contrastive time series representation', {
      max: 5,
      pauseMs: 0,
      fetch: async (url) => {
        urls.push(new URL(url).searchParams.get('search_query'))
        return urls.length < 3
          ? feed()
          : feed([
              '2106.10466',
              'TS2Vec: Towards Universal Representation of Time Series',
              '2021-06-19'
            ])
      }
    })
    assert.deepEqual(urls, [
      'all:universal AND all:contrastive AND all:time AND all:series AND all:representation',
      'all:universal AND all:contrastive AND all:time AND all:series',
      'all:universal AND all:contrastive AND all:time'
    ])
    assert.equal(result.results[0].inLibrary, 'yue2022ts2vec')
    assert.deepEqual(result.terms, ['universal', 'contrastive', 'time'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a failed search says what to do instead', async () => {
  const root = await project()
  try {
    await assert.rejects(
      searchPapers(root, 'anything here', {
        fetch: async () => {
          throw new Error('offline')
        }
      }),
      /arXiv search failed \(offline\)\. Use your web search or the project Library/u
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('with a socket named, the request goes to the local proxy, not the network', async (t) => {
  if (process.platform === 'win32') {
    t.skip('Unix sockets')
    return
  }
  const directory = await mkdtemp(path.join(os.tmpdir(), 'aster-sock-'))
  const socketPath = path.join(directory, 'search.sock')
  const seen = []
  const server = http.createServer((request, response) => {
    seen.push([request.headers.host, request.url])
    response.end(feed(['2303.11911', 'InfoTS', '2023-03-21']))
  })
  await new Promise((resolve) => server.listen(socketPath, resolve))
  try {
    const xml = await fetchText('https://export.arxiv.org/api/query?search_query=all%3Ax', {
      socketPath
    })
    assert.equal(parseArxivFeed(xml)[0].arxiv, '2303.11911')
    assert.deepEqual(seen, [['export.arxiv.org', '/api/query?search_query=all%3Ax']])
  } finally {
    await new Promise((resolve) => server.close(resolve))
    await rm(directory, { recursive: true, force: true })
  }
})
