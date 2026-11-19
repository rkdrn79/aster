import { useState } from 'react'
import { illustrationPalette } from '../../../../research-harness/research-figures-illustration-paint.mjs'
import type { InspectorContext } from './research-figure-inspector-registry'
import { illustrationRecord, isIllustration } from './research-figure-illustration'
import { restyleIllustrations } from './research-figure-illustration-edit'
import { InspectorChip, InspectorHeading } from './ResearchFigureInspectorParts'

/** The house looks, the same for every illustration in a figure. */
const LOOKS = [
  ['flat', 'Flat'],
  ['tonal', 'Tonal'],
  ['line', 'Line'],
  ['mono', 'Mono']
] as const
/** What an illustration's accent part can take: ours, the other actor, quiet, right, wrong. */
const ACCENT_ROLES = [
  ['accent', 'Accent'],
  ['second', 'Second'],
  ['neutral', 'Gray'],
  ['good', 'Good'],
  ['bad', 'Bad']
] as const

/** The look of the figure's illustrations and the colour role of the selected one's accent. */
export function InspectorIllustrationSection({
  context
}: {
  context: InspectorContext
}): React.JSX.Element | null {
  const [error, setError] = useState<string | null>(null)
  const selected = context.selected.filter(isIllustration)
  const first = selected[0] ? illustrationRecord(selected[0]) : null
  if (!first) {
    return null
  }
  const run = (work: Promise<number>): void => {
    setError(null)
    work.catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
  }
  const accent = first.roles.accent ?? 'accent'
  const ramps = illustrationPalette(context.style).ramps
  const swatch = (role: string): string => ramps[role]?.[4] ?? context.style.strong
  return (
    <div>
      <InspectorHeading>Illustration</InspectorHeading>
      <div className="grid grid-cols-4 gap-1 px-3" role="group" aria-label="Illustration look">
        {LOOKS.map(([look, label]) => (
          <InspectorChip
            key={look}
            pressed={(first.look ?? 'flat') === look}
            label={label}
            title={`${label}: every illustration in this figure`}
            onClick={() => {
              const api = context.api()
              if (!api) {
                return
              }
              // Why every illustration: one look per figure keeps mixed sources one hand.
              const all = new Set(
                context.elements.filter(isIllustration).map((element) => element.id)
              )
              run(
                restyleIllustrations(
                  api,
                  all,
                  (record) => ({ ...record, look }),
                  context.style,
                  context.commit,
                  look
                )
              )
            }}
          />
        ))}
      </div>
      <div
        className="flex flex-wrap items-center gap-1 px-3 pt-2"
        role="group"
        aria-label="Accent part"
      >
        <span className="mr-1 text-xs text-muted-foreground">Accent part</span>
        {ACCENT_ROLES.map(([role, label]) => (
          <InspectorChip
            key={role}
            pressed={accent === role}
            label={label}
            title={`Paint the accent part ${label.toLowerCase()}`}
            onClick={() => {
              const api = context.api()
              if (!api) {
                return
              }
              const ids = new Set(selected.map((element) => element.id))
              run(
                restyleIllustrations(
                  api,
                  ids,
                  (record) => ({ ...record, roles: { ...record.roles, accent: role } }),
                  context.style,
                  context.commit
                )
              )
            }}
          >
            <span
              aria-hidden
              className="size-2.5 rounded-full"
              style={{ background: swatch(role) }}
            />
          </InspectorChip>
        ))}
      </div>
      {error ? (
        <p role="alert" className="px-3 pt-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
