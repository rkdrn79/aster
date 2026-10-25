import path from 'node:path'
import { z } from 'zod'
import {
  researchAnalysisListSchema,
  type ResearchAnalysisItem,
  type ResearchAnalysisList
} from '../../shared/research/research-analysis'
import {
  authorizedProjectPath,
  callHarness,
  handle,
  readTextFileHead
} from './research-harness-ipc'
import { containedProjectFile } from './research-claims-audit'

const MAX_TEXT_BYTES = 256 * 1024
// Why: figures load through researchMedia.url; this channel only hands text tables and notes over.
const TEXT_EXTENSIONS = new Set(['.md', '.txt', '.csv', '.tsv', '.json'])
const EXPERIMENT_SLUG = /^[\p{L}\p{N}][\p{L}\p{N}-]{0,63}$/u

const workspacePath = z.string().min(1).max(4096)
const listSchema = z
  .object({ workspacePath, experiment: z.string().regex(EXPERIMENT_SLUG) })
  .strict()
const readSchema = z.object({ workspacePath, path: z.string().min(1).max(4096) }).strict()

function isItem(item: ResearchAnalysisItem | null): item is ResearchAnalysisItem {
  return item !== null
}

/** Local catalog projects only: the analysis ledger of an Experiment and its text files. */
export function registerResearchAnalysisIpcHandlers(): void {
  handle('researchAnalysis:list', listSchema, async (input): Promise<ResearchAnalysisList> => {
    const list = researchAnalysisListSchema.parse(
      await callHarness(
        'research-analysis.mjs',
        'listAnalyses',
        await authorizedProjectPath(input.workspacePath),
        input.experiment
      )
    )
    return { ...list, items: list.items.filter(isItem) }
  })
  handle('researchAnalysis:read', readSchema, async (input) => {
    const project = await authorizedProjectPath(input.workspacePath)
    const file = await containedProjectFile(project, input.path)
    if (!TEXT_EXTENSIONS.has(path.extname(file).toLowerCase())) {
      throw new Error('Only Markdown, text, CSV, TSV, and JSON analysis files can be read.')
    }
    const { content, truncated } = await readTextFileHead(file, MAX_TEXT_BYTES)
    return { path: input.path, content, truncated }
  })
}
