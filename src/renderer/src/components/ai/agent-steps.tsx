import { useState } from 'react'
import { cn } from '@/lib/utils'
import './ai-motion.css'

export type AgentStepStatus = 'pending' | 'running' | 'done' | 'failed'

/**
 * A step's mark: an empty ring while it waits, a turning arc while it runs, a disc whose check
 * draws itself when it finishes, and a crossed ring when it fails. Colours come from
 * `currentColor`, so the list around it sets the tone. `animate` plays the finish once; a step
 * that was already done when it appeared just shows its check.
 */
export function AgentStepIcon({
  status,
  animate = false,
  className
}: {
  status: AgentStepStatus
  animate?: boolean
  className?: string
}): React.JSX.Element {
  const common = {
    'aria-hidden': true,
    viewBox: '0 0 16 16',
    fill: 'none',
    'data-step-icon': status,
    className: cn('size-4 shrink-0', className)
  } as const
  if (status === 'running') {
    return (
      // The ring is round, so the whole mark turns; the arc reads as the moving part.
      <svg
        {...common}
        className={cn(
          common.className,
          'animate-spin [animation-duration:1.1s] motion-reduce:animate-none'
        )}
      >
        <circle
          cx="8"
          cy="8"
          r="6.25"
          stroke="currentColor"
          strokeOpacity="0.28"
          strokeWidth="1.5"
        />
        <path
          d="M8 1.75a6.25 6.25 0 0 1 6.25 6.25"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  if (status === 'done') {
    return (
      <svg {...common}>
        <circle
          cx="8"
          cy="8"
          r="7"
          fill="currentColor"
          className={animate ? 'ai-step-fill' : undefined}
        />
        <path
          d="m5 8.25 2 2 4-4.25"
          stroke="var(--ai-step-check, var(--background))"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          className={animate ? 'draw-stroke [animation-delay:90ms]' : undefined}
        />
      </svg>
    )
  }
  if (status === 'failed') {
    return (
      <svg {...common} className={cn(common.className, 'text-destructive')}>
        <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
        <path d="m6 6 4 4m0-4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.5" />
    </svg>
  )
}

/** Whether `status` turned `done` after this component first rendered. */
function useFinishedHere(status: AgentStepStatus): boolean {
  const [doneAtMount] = useState(status === 'done')
  return status === 'done' && !doneAtMount
}

/**
 * One row of an agent's plan. The running row's mark turns; a row that finishes while shown
 * draws its check. Children are the row's words, so
 * callers keep their own text, screen-reader status and truncation.
 */
export function AgentStepRow({
  status,
  meta,
  className,
  children
}: {
  status: AgentStepStatus
  /** Right-aligned detail, e.g. "3 files" or "12/12". */
  meta?: React.ReactNode
  className?: string
  children: React.ReactNode
}): React.JSX.Element {
  const finishedHere = useFinishedHere(status)
  return (
    <li
      data-step-status={status}
      className={cn('relative flex items-start gap-2 py-0.5', className)}
    >
      <span className="flex h-[1lh] shrink-0 items-center">
        <AgentStepIcon status={status} animate={finishedHere} />
      </span>
      <span className="min-w-0 flex-1">{children}</span>
      {meta !== undefined ? (
        <span className="shrink-0 pl-2 text-xs tabular-nums opacity-80">{meta}</span>
      ) : null}
    </li>
  )
}

/** A small ring that fills as steps finish; reads as "2 of 5" at a glance in a folded header.
 *  A finished plan shows the done disc, since a full ring reads the same as an empty one. */
export function AgentStepsProgress({
  done,
  total,
  className
}: {
  done: number
  total: number
  className?: string
}): React.JSX.Element {
  const share = total > 0 ? Math.min(1, done / total) : 0
  const finishedHere = useFinishedHere(total > 0 && done >= total ? 'done' : 'running')
  if (total > 0 && done >= total) {
    return <AgentStepIcon status="done" animate={finishedHere} className={className} />
  }
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      fill="none"
      className={cn('size-4 shrink-0 -rotate-90', className)}
    >
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.22" strokeWidth="1.5" />
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={`${share} 1`}
        className="transition-[stroke-dasharray] duration-(--duration-slow) ease-out-quint motion-reduce:transition-none"
        opacity={share > 0 ? 1 : 0}
      />
    </svg>
  )
}
