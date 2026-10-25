import { z } from 'zod'
import {
  researchRunMediaIndexSchema,
  type ResearchRunMediaIndex
} from '../../shared/research/research-run-media'
import {
  researchRunSummarySchema,
  type ResearchRunSummary,
  type ResearchRunSummaryList
} from '../../shared/research/research-run-summary'
import { authorizedProjectPath, callHarness, handle } from './research-harness-ipc'

const SUMMARY_MODULE = 'research-run-summary.mjs'
const NOTES_MODULE = 'research-run-notes.mjs'
// Same rule as the harness's experiment slugs, so a folder name never escapes the experiments folder.
const EXPERIMENT_SLUG = /^[\p{L}\p{N}][\p{L}\p{N}-]{0,63}$/u
const runReference = z.string().trim().min(3).max(160)
const workspacePath = z.string().min(1).max(4096)

const experimentSchema = z
  .object({ workspacePath, experiment: z.string().regex(EXPERIMENT_SLUG) })
  .strict()
const organizeSchema = z
  .object({
    workspacePath,
    run: runReference.optional(),
    experiment: z.string().regex(EXPERIMENT_SLUG).optional()
  })
  .strict()
  .refine((input) => Boolean(input.run) !== Boolean(input.experiment))
const runSchema = z.object({ workspacePath, run: runReference }).strict()
const storedSummariesSchema = z.object({
  runs: z.array(z.object({ run: z.string(), summary: z.unknown() }))
})
const organizedSchema = z.object({ organized: z.number().int().nonnegative() })
const noteText = z.string().trim().min(1).max(2000)
const noteAt = z.string().min(1).max(64)
const addNoteSchema = z.object({ workspacePath, run: runReference, text: noteText }).strict()
const editNoteSchema = z
  .object({ workspacePath, run: runReference, at: noteAt, text: noteText })
  .strict()
const deleteNoteSchema = z.object({ workspacePath, run: runReference, at: noteAt }).strict()
const notesResultSchema = z.object({ notes: researchRunSummarySchema.shape.notes })

/** The user's own Run notes in summary.json; the harness refuses to touch agents' notes. */
async function changeNotes(
  name: 'addUserRunNote' | 'editUserRunNote' | 'deleteUserRunNote',
  { workspacePath: workspace, ...input }: { workspacePath: string; run: string }
): Promise<{ notes: ResearchRunSummary['notes'] }> {
  const { notes } = notesResultSchema.parse(
    await callHarness(NOTES_MODULE, name, await authorizedProjectPath(workspace), input)
  )
  return { notes }
}

/** Reads summary.json files as written; an unreadable one reads as not organized yet. */
async function runSummaries(
  workspace: string,
  experiment: string
): Promise<ResearchRunSummaryList> {
  const { runs } = storedSummariesSchema.parse(
    await callHarness(
      SUMMARY_MODULE,
      'readRunSummaries',
      await authorizedProjectPath(workspace),
      experiment
    )
  )
  return {
    runs: runs.map(({ run, summary }) => {
      const parsed = researchRunSummarySchema.safeParse(summary)
      return { run, summary: parsed.success ? parsed.data : null }
    })
  }
}

/** Local catalog projects only; organizing is deterministic and records nobody's judgment. */
export function registerResearchOrganizeIpcHandlers(): void {
  handle('researchOrganize:summaries', experimentSchema, async (input) =>
    runSummaries(input.workspacePath, input.experiment)
  )
  handle(
    'researchOrganize:organize',
    organizeSchema,
    async (input): Promise<{ organized: number }> => {
      const { organized } = organizedSchema.parse(
        await callHarness(
          SUMMARY_MODULE,
          'organizeRuns',
          await authorizedProjectPath(input.workspacePath),
          { run: input.run ?? null, experiment: input.experiment ?? null }
        )
      )
      return { organized }
    }
  )
  handle('researchOrganize:addNote', addNoteSchema, async (input) =>
    changeNotes('addUserRunNote', input)
  )
  handle('researchOrganize:editNote', editNoteSchema, async (input) =>
    changeNotes('editUserRunNote', input)
  )
  handle('researchOrganize:deleteNote', deleteNoteSchema, async (input) =>
    changeNotes('deleteUserRunNote', input)
  )
  handle('researchOrganize:media', runSchema, async (input): Promise<ResearchRunMediaIndex> =>
    researchRunMediaIndexSchema.parse(
      await callHarness(
        'research-run-media.mjs',
        'readRunMediaIndex',
        await authorizedProjectPath(input.workspacePath),
        input.run
      )
    )
  )
}
