import { z } from 'zod'
import {
  WRITING_SKELETON_SECTIONS,
  writingCheckResultSchema,
  writingCodeFoldersSchema,
  writingSkeletonListSchema,
  writingSkeletonSchema,
  type WritingCheckResult,
  type WritingCodeFolder,
  type WritingSkeleton
} from '../../shared/research/research-writing-results'
import { authorizedProjectPath, callHarness, handle } from './research-harness-ipc'

const CHECK_MODULE = 'research-writing-check.mjs'
const SKELETON_MODULE = 'research-writing-skeleton.mjs'
const CONTEXT_MODULE = 'research-writing-context.mjs'
// Why a cap: the panel lists findings to act on; a draft with thousands of hits is unreadable anyway.
const MAX_FINDINGS_PER_SECTION = 200

const workspaceSchema = z.object({ workspacePath: z.string().min(1).max(4096) }).strict()
const checkSchema = workspaceSchema.extend({
  file: z.string().trim().min(1).max(4096).optional()
})
const sectionSchema = workspaceSchema.extend({ section: z.enum(WRITING_SKELETON_SECTIONS) })
const skeletonSetSchema = sectionSchema.extend({
  lines: z.record(z.string().regex(/^[A-Z][A-Z-]{0,23}$/u), z.string().max(4000)),
  notes: z.string().max(20_000).optional()
})

async function writingCheck(project: string, file?: string): Promise<WritingCheckResult> {
  const result = writingCheckResultSchema.parse(
    await callHarness(CHECK_MODULE, 'checkWriting', project, { file: file ?? null })
  )
  return {
    ...result,
    sections: result.sections.map((section) => ({
      ...section,
      errors: section.errors.slice(0, MAX_FINDINGS_PER_SECTION),
      warnings: section.warnings.slice(0, MAX_FINDINGS_PER_SECTION),
      notes: section.notes.slice(0, MAX_FINDINGS_PER_SECTION)
    }))
  }
}

/**
 * Writing check, skeletons and code folders for the Writing page. Skeleton writes come from the
 * person on the page, so they are recorded as the user's (the CLI refuses that inside agents).
 */
export function registerResearchWritingIpcHandlers(): void {
  handle('researchHarness:writingCheck', checkSchema, async (input) =>
    writingCheck(await authorizedProjectPath(input.workspacePath), input.file)
  )
  handle(
    'researchHarness:writingSkeletons',
    workspaceSchema,
    async ({ workspacePath }): Promise<WritingSkeleton[]> =>
      writingSkeletonListSchema.parse(
        await callHarness(
          SKELETON_MODULE,
          'listWritingSkeletons',
          await authorizedProjectPath(workspacePath)
        )
      ).skeletons
  )
  handle(
    'researchHarness:writingSkeletonSet',
    skeletonSetSchema,
    async (input): Promise<WritingSkeleton> =>
      writingSkeletonSchema.parse(
        await callHarness(
          SKELETON_MODULE,
          'setWritingSkeleton',
          await authorizedProjectPath(input.workspacePath),
          input.section,
          {
            lines: input.lines,
            ...(input.notes === undefined ? {} : { notes: input.notes }),
            by: 'user'
          }
        )
      )
  )
  handle(
    'researchHarness:writingSkeletonConfirm',
    sectionSchema,
    async (input): Promise<WritingSkeleton> =>
      writingSkeletonSchema.parse(
        await callHarness(
          SKELETON_MODULE,
          'confirmWritingSkeleton',
          await authorizedProjectPath(input.workspacePath),
          input.section,
          { by: 'user' }
        )
      )
  )
  handle(
    'researchHarness:writingCodeFolders',
    workspaceSchema,
    async ({ workspacePath }): Promise<WritingCodeFolder[]> =>
      writingCodeFoldersSchema.parse(
        await callHarness(
          CONTEXT_MODULE,
          'listCodeFolders',
          await authorizedProjectPath(workspacePath)
        )
      ).folders
  )
}
