import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { downloadArxivPdfToWorkspace } from './research-library-pdf-download'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('arXiv Library PDF download', () => {
  it('stores a validated PDF in the project and reuses identical downloads', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aster-library-pdf-'))
    roots.push(root)
    const body = new TextEncoder().encode('%PDF-1.7\n%%EOF')
    const urls: string[] = []
    const fetchPdf = async (url: string): Promise<Response> => {
      urls.push(url)
      return new Response(body, { headers: { 'content-type': 'application/pdf' } })
    }
    const first = await downloadArxivPdfToWorkspace(root, '2607.13298', fetchPdf)
    const second = await downloadArxivPdfToWorkspace(root, '2607.13298', fetchPdf)
    expect(first).toEqual(second)
    expect(first.relativePath).toBe('.aster/library/papers/2607.13298.pdf')
    expect(await readFile(join(root, first.relativePath), 'utf8')).toBe('%PDF-1.7\n%%EOF')
    expect(urls).toEqual(['https://arxiv.org/pdf/2607.13298', 'https://arxiv.org/pdf/2607.13298'])
  })

  it('rejects a non-PDF response before creating a Library file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aster-library-pdf-'))
    roots.push(root)
    await expect(
      downloadArxivPdfToWorkspace(
        root,
        '2607.13298',
        async () => new Response('<html>error</html>')
      )
    ).rejects.toThrow('arXiv did not return a PDF')
  })
})
