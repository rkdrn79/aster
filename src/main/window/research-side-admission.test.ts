import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { admitResearchSideSrc, type ResearchSidePageLocation } from './research-side-admission'

const PAGE = '/Applications/Aster.app/Contents/Resources/app.asar/out/renderer/research-window.html'
const packaged: ResearchSidePageLocation = { kind: 'file', path: PAGE }
const dev: ResearchSidePageLocation = { kind: 'dev-server', origin: 'http://localhost:5173' }

function src(base: string, query: Record<string, string>): string {
  const url = new URL(base)
  for (const [name, value] of Object.entries(query)) {
    url.searchParams.set(name, value)
  }
  return url.toString()
}

const sideQuery = { page: 'research-writing', workspaceId: 'repo::/w/a', side: 'side-1' }

describe('which <webview> may become a project side', () => {
  it('admits the build’s own project page with a side and a project', () => {
    expect(admitResearchSideSrc(src(pathToFileURL(PAGE).href, sideQuery), packaged)).toEqual({
      sideId: 'side-1',
      workspaceId: 'repo::/w/a'
    })
    expect(
      admitResearchSideSrc(src('http://localhost:5173/research-window.html', sideQuery), dev)
    ).toMatchObject({ sideId: 'side-1' })
  })

  it('refuses any other document, which must not get the app preload', () => {
    const other = pathToFileURL('/tmp/evil/research-window.html').href
    expect(admitResearchSideSrc(src(other, sideQuery), packaged)).toBeNull()
    expect(
      admitResearchSideSrc(src('https://example.com/research-window.html', sideQuery), packaged)
    ).toBeNull()
    expect(
      admitResearchSideSrc(src('http://localhost:5174/research-window.html', sideQuery), dev)
    ).toBeNull()
    expect(admitResearchSideSrc(src('http://localhost:5173/index.html', sideQuery), dev)).toBeNull()
    expect(admitResearchSideSrc('not a url', packaged)).toBeNull()
  })

  it('refuses the page without a side id or a well-formed project', () => {
    const base = pathToFileURL(PAGE).href
    expect(admitResearchSideSrc(src(base, { ...sideQuery, side: '' }), packaged)).toBeNull()
    expect(admitResearchSideSrc(src(base, { ...sideQuery, side: '../x' }), packaged)).toBeNull()
    expect(admitResearchSideSrc(src(base, { ...sideQuery, page: 'settings' }), packaged)).toBeNull()
    expect(admitResearchSideSrc(`${src(base, sideQuery)}#x`, packaged)).toBeNull()
  })
})
