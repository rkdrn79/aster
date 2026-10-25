import { useEffect, useState } from 'react'
import { ChevronRight, FilePenLine } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ResearchAnalysisItem } from '../../../../shared/research/research-analysis'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import {
  analysisNoteExcerpt,
  analysisPreviewKind,
  parseAnalysisTable,
  type AnalysisTable
} from './research-analysis-preview'
import { experimentChatPrompt } from './research-experiment-agent-chat'
import { formatMetricInColumn, metricColumnDecimals } from './research-metric-column-format'
import { researchRelativeTime } from './research-relative-time'
import { ResearchExperimentChatButton } from './ResearchExperimentAgentPane'
import type { ExperimentWorkspace } from './research-experiment-workspace-state'
import { researchErrorText } from './research-error-text'
import { sendAnalysisToWriting } from './research-handoff-send'
import { useNearViewport, useResearchMediaUrl } from './research-media-url'
import { openResearchView } from './research-navigation'
import { requestWritingAgentFocus } from './research-writing-agent-focus'
import { NotebookSection } from './ResearchExperimentNotebookLayout'
import { researchAnalysisBridge } from './use-research-analysis'
import { catalogRunReference } from './use-research-harness-experiment'

const TABLE_ROWS = 5
const NOTE_LINES = 4
const FULL_TABLE_ROWS = 200

type FileText = { path: string; content: string | null; truncated: boolean; error: string | null }

const DECIMAL_CELL = /^-?\d+(?:\.(\d+))?$/u

/** Numeric columns at one precision each: the column's, never finer than the file wrote. */
function columnAlignedRows(table: AnalysisTable): string[][] {
  const decimals = table.columns.map((_, index) => {
    let written = 0
    const values: number[] = []
    for (const row of table.rows) {
      const cell = row[index]?.trim()
      if (!cell) {
        continue
      }
      const match = DECIMAL_CELL.exec(cell)
      if (!match) {
        return null
      }
      values.push(Number(cell))
      written = Math.max(written, match[1]?.length ?? 0)
    }
    return values.length && written ? Math.min(written, metricColumnDecimals(values)) : null
  })
  return table.rows.map((row) =>
    row.map((cell, index) => {
      const places = decimals[index]
      return places === null || places === undefined || !cell.trim()
        ? cell
        : formatMetricInColumn(Number(cell), places)
    })
  )
}

/** A table or note file's text, read once the preview nears the viewport. */
function useAnalysisText(
  experiment: ExperimentRecord,
  path: string,
  wanted: boolean
): FileText | null {
  const [text, setText] = useState<FileText | null>(null)
  const { workspacePath } = experiment
  useEffect(() => {
    const read = researchAnalysisBridge().read
    if (!wanted || !read) {
      return
    }
    let active = true
    read({ workspacePath, path }).then(
      (result) => {
        if (active) {
          setText({ path, content: result.content, truncated: result.truncated, error: null })
        }
      },
      (cause: unknown) => {
        if (active) {
          setText({ path, content: null, truncated: false, error: researchErrorText(cause) })
        }
      }
    )
    return () => {
      active = false
    }
  }, [path, wanted, workspacePath])
  return text?.path === path ? text : null
}

function TablePreview({ table }: { table: AnalysisTable }): React.JSX.Element {
  return (
    <div className="scrollbar-sleek max-h-80 overflow-auto">
      <table className="w-full text-left font-mono text-xs tabular-nums">
        <thead className="text-muted-foreground">
          <tr className="border-b border-border">
            {table.columns.map((column, index) => (
              <th key={`${index}:${column}`} className="py-1 pr-3 font-normal">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {columnAlignedRows(table).map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-border/60">
              {table.columns.map((_, index) => (
                <td key={index} className="py-1 pr-3">
                  {row[index] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AnalysisPreview({
  experiment,
  item
}: {
  experiment: ExperimentRecord
  item: ResearchAnalysisItem
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [ref, near] = useNearViewport()
  const kind = analysisPreviewKind(item)
  const media = useResearchMediaUrl(experiment, [item.file], near && kind === 'figure')
  const text = useAnalysisText(experiment, item.file, near && (kind === 'table' || kind === 'note'))
  const toggle = (label: string): React.JSX.Element => (
    <Button size="xs" variant="ghost" onClick={() => setExpanded((value) => !value)}>
      <ChevronRight
        aria-hidden
        className={cn(
          'transition-transform motion-reduce:transition-none',
          expanded && 'rotate-90'
        )}
      />
      {expanded ? 'Show less' : label}
    </Button>
  )
  let body: React.ReactNode
  if (kind === 'figure') {
    body = media.url ? (
      <button
        type="button"
        className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={expanded ? `Shrink ${item.title}` : `Enlarge ${item.title}`}
        onClick={() => setExpanded((value) => !value)}
      >
        <img
          src={media.url}
          alt={item.title}
          className={cn(
            'max-w-full rounded-md border border-border object-contain',
            !expanded && 'max-h-56'
          )}
        />
      </button>
    ) : (
      <p className="text-xs text-muted-foreground">{media.error ?? 'Loading figure…'}</p>
    )
  } else if (kind === 'file') {
    body = <p className="font-mono text-xs text-muted-foreground">{item.file}</p>
  } else if (!text) {
    body = <p className="text-xs text-muted-foreground">Reading {item.file}…</p>
  } else if (text.error || text.content === null) {
    body = <p className="text-xs text-destructive">{text.error ?? 'Unreadable.'}</p>
  } else if (kind === 'table') {
    const table = parseAnalysisTable(
      text.content,
      item.file,
      expanded ? FULL_TABLE_ROWS : TABLE_ROWS
    )
    body = table ? (
      <div className="space-y-1">
        <TablePreview table={table} />
        {table.total > TABLE_ROWS ? toggle(`All ${table.total} rows`) : null}
      </div>
    ) : (
      <p className="text-xs text-muted-foreground">{item.file} is not a table Aster can read.</p>
    )
  } else {
    const excerpt = analysisNoteExcerpt(text.content, NOTE_LINES)
    body = (
      <div className="space-y-1">
        <p className="whitespace-pre-wrap text-sm">{expanded ? text.content : excerpt.text}</p>
        {excerpt.more || text.truncated ? toggle('Read all') : null}
      </div>
    )
  }
  return <div ref={ref}>{body}</div>
}

function AnalysisEntry({
  workspace,
  experiment,
  item
}: {
  workspace: ExperimentWorkspace
  experiment: ExperimentRecord
  item: ResearchAnalysisItem
}): React.JSX.Element {
  const [sending, setSending] = useState(false)
  const runNames = item.runs.map(
    (reference) =>
      workspace.runs.find((run) => catalogRunReference(run) === reference)?.name ?? reference
  )
  async function sendToPaper(): Promise<void> {
    setSending(true)
    try {
      const outcome = await sendAnalysisToWriting(experiment, item)
      if (!outcome.ok) {
        toast.error(outcome.message)
        return
      }
      toast.success(`Sent “${item.title}” to the Writing agent.`, {
        action: {
          label: 'Open',
          onClick: () => {
            requestWritingAgentFocus(experiment.id)
            openResearchView('research-writing')
          }
        }
      })
    } finally {
      setSending(false)
    }
  }
  return (
    <li aria-label={`Analysis ${item.title}`} className="space-y-2 py-4 first:pt-0">
      <div className="flex min-w-0 items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="text-sm font-medium">{item.title}</h3>
          {item.summary ? <p className="text-sm">{item.summary}</p> : null}
          <p className="truncate text-xs text-muted-foreground">
            {[
              runNames.length ? runNames.join(', ') : null,
              item.by === 'agent' ? 'Agent' : 'You',
              researchRelativeTime(item.at)
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <Button size="xs" variant="ghost" disabled={sending} onClick={() => void sendToPaper()}>
          <FilePenLine aria-hidden />
          Use in paper
        </Button>
      </div>
      <AnalysisPreview experiment={experiment} item={item} />
    </li>
  )
}

/** The agent's recorded analyses, newest first: a takeaway and the figure, table, or note behind it. */
export function ResearchExperimentNotebookAnalysis({
  workspace
}: {
  workspace: ExperimentWorkspace
}): React.JSX.Element | null {
  const { experiment, scope, analyses } = workspace
  if (!experiment || !scope) {
    return null
  }
  return (
    <NotebookSection label="Analysis">
      {analyses.error ? (
        <p role="alert" className="text-xs text-destructive">
          {analyses.error}
        </p>
      ) : null}
      {analyses.items.length ? (
        <ul className="divide-y divide-border">
          {analyses.items.map((item) => (
            <AnalysisEntry
              key={item.id}
              workspace={workspace}
              experiment={experiment}
              item={item}
            />
          ))}
        </ul>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground">
            {analyses.loading
              ? 'Reading analyses…'
              : analyses.available
                ? 'No analyses yet.'
                : 'Reload Aster to show analyses.'}
          </p>
          <ResearchExperimentChatButton
            experiment={experiment}
            variant="outline"
            build={(setup) => experimentChatPrompt('analyze', setup)}
          >
            Ask the agent to analyze
          </ResearchExperimentChatButton>
        </div>
      )}
    </NotebookSection>
  )
}
