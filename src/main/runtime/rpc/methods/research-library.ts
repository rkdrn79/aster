import { defineMethod } from '../core'
import { researchLibraryDocumentSchema } from '../../../../shared/research/research-library'
import {
  ResearchLibraryReferenceParams,
  ResearchLibraryTitleSearchParams
} from '../../../../shared/research/research-library-rpc'
import { lookupArxivPaper, lookupDoiPaper } from '../../../research/research-library-lookups'
import {
  readResearchLibrary,
  saveResearchLibrary
} from '../../../research/research-library-repository'
import { searchPaperByTitle } from '../../../research/research-library-search'

const fetchUrl = (url: string, init: RequestInit): Promise<Response> => fetch(url, init)

// Why: a phone has no Library of its own; the host keeps one, so papers a chat names reach it
// from the phone the way the desktop's IPC reaches its own.
export const RESEARCH_LIBRARY_METHODS = [
  defineMethod({
    name: 'researchLibrary.read',
    permission: 'workspace',
    params: null,
    handler: () => readResearchLibrary()
  }),
  defineMethod({
    name: 'researchLibrary.save',
    permission: 'workspace',
    params: researchLibraryDocumentSchema,
    handler: (document) => saveResearchLibrary(document)
  }),
  defineMethod({
    name: 'researchLibrary.lookupArxiv',
    permission: 'workspace',
    params: ResearchLibraryReferenceParams,
    handler: ({ reference }) => lookupArxivPaper(reference, fetchUrl)
  }),
  defineMethod({
    name: 'researchLibrary.lookupDoi',
    permission: 'workspace',
    params: ResearchLibraryReferenceParams,
    handler: ({ reference }) => lookupDoiPaper(reference, fetchUrl)
  }),
  defineMethod({
    name: 'researchLibrary.searchTitle',
    permission: 'workspace',
    params: ResearchLibraryTitleSearchParams,
    handler: (query) => searchPaperByTitle(query, fetchUrl)
  })
]
