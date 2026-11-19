import type { PreloadApi } from '../../../../preload/api-types'
import { toRuntimeExecutionHostId } from '../../../../shared/execution-host'
import {
  libraryScopeKey,
  type ResearchLibraryDocument
} from '../../../../shared/research/research-library'
import { callRuntimeResult } from './web-runtime-calls'
import { requireActiveEnvironment } from './web-runtime-session'

// Why longer: the host waits on arXiv or Crossref, which take up to 20s each.
const LOOKUP_TIMEOUT_MS = 45_000
// The host files its own workspaces under `local`; this client names that host by its pairing.
const HOST_SCOPE = 'local'

function clientHostId(): string {
  return toRuntimeExecutionHostId(requireActiveEnvironment().id)
}

function rescopeKey(key: string, from: string, to: string): string {
  try {
    const parsed: unknown = JSON.parse(key)
    if (Array.isArray(parsed) && parsed[0] === from && typeof parsed[1] === 'string') {
      return libraryScopeKey({ hostId: to, workspaceId: parsed[1] })
    }
  } catch {
    // A key this client did not write stays as it is.
  }
  return key
}

/** Moves the document's papers and reading chats from one host name to the other. */
export function rescopeLibraryDocument(
  document: ResearchLibraryDocument,
  from: string,
  to: string
): ResearchLibraryDocument {
  return {
    ...document,
    papers: document.papers.map((paper) =>
      paper.scope.hostId === from ? { ...paper, scope: { ...paper.scope, hostId: to } } : paper
    ),
    readingAgentSessionByScope: Object.fromEntries(
      Object.entries(document.readingAgentSessionByScope).map(([key, session]) => [
        rescopeKey(key, from, to),
        session
      ])
    )
  }
}

/**
 * The Library through the paired host: the paper prompt in chat, adding papers, and their lookups.
 * A host too old for these methods fails the read, and the prompt stays away as before.
 */
export function createWebResearchLibraryApi(): PreloadApi['researchLibrary'] {
  return {
    read: async () =>
      rescopeLibraryDocument(
        await callRuntimeResult<ResearchLibraryDocument>('researchLibrary.read'),
        HOST_SCOPE,
        clientHostId()
      ),
    save: async (document) => {
      const hostId = clientHostId()
      const saved = await callRuntimeResult<ResearchLibraryDocument>(
        'researchLibrary.save',
        rescopeLibraryDocument(document, hostId, HOST_SCOPE)
      )
      return rescopeLibraryDocument(saved, HOST_SCOPE, hostId)
    },
    // Why absent: one browser window, and no other window on the host saves through it.
    onChanged: undefined,
    lookupArxiv: (params) =>
      callRuntimeResult('researchLibrary.lookupArxiv', params, LOOKUP_TIMEOUT_MS),
    lookupDoi: (params) =>
      callRuntimeResult('researchLibrary.lookupDoi', params, LOOKUP_TIMEOUT_MS),
    searchTitle: (params) =>
      callRuntimeResult('researchLibrary.searchTitle', params, LOOKUP_TIMEOUT_MS),
    // Why refused: a paired workspace downloads through researchProject.downloadArxivPdf by its id.
    downloadArxivPdf: () =>
      Promise.reject(new Error('This browser downloads Library PDFs through its workspace.')),
    importPdf: () => Promise.resolve({ status: 'cancelled' })
  }
}
