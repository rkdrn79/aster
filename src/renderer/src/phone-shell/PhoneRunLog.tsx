import { useState } from 'react'
import type { ResearchProjectRunLogTailResult } from '../../../shared/research/research-project-api'
import { PhoneSectionNote } from './PhoneListLayout'

const LOG_LINES_COLLAPSED = 20
// Why hidden by default: these are the harness's own records, already shown as metrics and media.
const RECORD_LINE = /^\s*ASTER_(?:METRIC|MEDIA)\b/

/** Log lines a person reads; record lines only when asked for. */
export function readableLogLines(
  text: string,
  showRecords: boolean
): {
  lines: string[]
  records: number
} {
  const all = text.replace(/\n+$/, '').split('\n')
  if (all.length === 1 && !all[0]) {
    return { lines: [], records: 0 }
  }
  const lines = showRecords ? all : all.filter((line) => !RECORD_LINE.test(line))
  return { lines, records: all.length - all.filter((line) => !RECORD_LINE.test(line)).length }
}

const TOGGLE =
  'flex h-11 w-full items-center justify-center text-[13px] font-medium text-foreground active:bg-accent'

/** The end of a Run's log, newest last; earlier lines and harness records unfold on request. */
export function PhoneRunLog({
  log,
  error
}: {
  log: ResearchProjectRunLogTailResult | null
  error: string | null
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [showRecords, setShowRecords] = useState(false)
  if (error && !log) {
    return <PhoneSectionNote>{error}</PhoneSectionNote>
  }
  const { lines, records } = readableLogLines(
    log?.status === 'present' ? log.text : '',
    showRecords
  )
  if (lines.length === 0 && records === 0) {
    return <PhoneSectionNote>No log written yet</PhoneSectionNote>
  }
  const hidden = expanded ? 0 : Math.max(0, lines.length - LOG_LINES_COLLAPSED)
  return (
    <div className="bg-editor-surface">
      {hidden > 0 || expanded ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className={`${TOGGLE} border-b border-border`}
        >
          {expanded ? 'Show only the newest lines' : `Show ${hidden} earlier lines`}
        </button>
      ) : null}
      <pre className="px-4 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
        {lines.length ? lines.slice(hidden).join('\n') : 'Only metric and media records so far.'}
      </pre>
      {records > 0 ? (
        <button
          type="button"
          onClick={() => setShowRecords((value) => !value)}
          className={`${TOGGLE} border-t border-border text-muted-foreground`}
        >
          {showRecords
            ? 'Hide metric and media records'
            : `Show ${records} metric and media records`}
        </button>
      ) : null}
    </div>
  )
}
