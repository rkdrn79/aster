import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { writePluginFileAtomically } from '../plugins/plugin-atomic-file-write'
import { getCanonicalUserDataPath } from '../persistence/loading-store/user-data-path'
import {
  emptyResearchDocument,
  researchDocumentSchema,
  type ResearchDocument
} from '../../shared/research/research-records'

let writeQueue: Promise<void> = Promise.resolve()

function documentPath(): string {
  return join(getCanonicalUserDataPath(), 'research', 'research.json')
}

export async function readResearchDocument(): Promise<ResearchDocument> {
  let content: string
  try {
    content = await readFile(documentPath(), 'utf8')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return emptyResearchDocument()
    }
    throw error
  }
  const parsed: unknown = JSON.parse(content)
  const result = researchDocumentSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(
      'Research metadata is invalid or from an unsupported schema. The file was not changed.'
    )
  }
  return result.data
}

export function saveResearchDocument(next: ResearchDocument): Promise<ResearchDocument> {
  const pending = writeQueue.then(async () => {
    const validated = researchDocumentSchema.parse(next)
    const current = await readResearchDocument()
    if (validated.revision !== current.revision) {
      throw new Error('Research metadata changed in another window. Reload before saving.')
    }
    const saved = { ...validated, revision: current.revision + 1 }
    const file = documentPath()
    await mkdir(dirname(file), { recursive: true })
    if (current.revision > 0) {
      await copyFile(file, `${file}.bak`)
    }
    await writePluginFileAtomically(file, `${JSON.stringify(saved, null, 2)}\n`, { mode: 0o600 })
    return saved
  })
  writeQueue = pending.then(
    () => undefined,
    () => undefined
  )
  return pending
}
