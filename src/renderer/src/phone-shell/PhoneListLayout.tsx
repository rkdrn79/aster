import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** A full-height scrolling screen body that keeps clear of the side safe areas. */
export function PhoneScrollBody({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div
      className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto overscroll-contain pr-[env(safe-area-inset-right)] pb-8 pl-[env(safe-area-inset-left)]"
      data-phone-scroll-body=""
    >
      {children}
    </div>
  )
}

/**
 * An inset-grouped block: an optional sentence-case label, then one rounded surface whose rows
 * touch and are split by hairlines.
 */
export function PhoneSection({
  label,
  trailing,
  children
}: {
  label?: string
  trailing?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section aria-label={label} className="px-4 pt-5">
      {label || trailing ? (
        <div className="flex min-h-7 items-end justify-between gap-3 px-4 pb-1.5">
          {label ? (
            <h2 className="text-[13px] font-medium text-muted-foreground">{label}</h2>
          ) : (
            <span />
          )}
          {trailing}
        </div>
      ) : null}
      {/* Why pseudo-elements: hairlines start at the text inset, past a row's glyph (PhoneRow). */}
      <div className="overflow-hidden rounded-xl border border-border bg-card [&>*+*]:relative [&>*+*]:before:absolute [&>*+*]:before:top-0 [&>*+*]:before:right-0 [&>*+*]:before:left-[var(--phone-row-inset,1rem)] [&>*+*]:before:h-px [&>*+*]:before:bg-border">
        {children}
      </div>
    </section>
  )
}

export type PhoneStatusTone = 'attention' | 'working' | 'success' | 'danger' | 'neutral'

/** A short state label; the colour carries state, so rows need no other marker. */
export function PhoneStatusPill({
  tone,
  children
}: {
  tone: PhoneStatusTone
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap',
        tone === 'attention' && 'bg-agent-question/15 text-agent-question-text',
        tone === 'working' && 'bg-secondary text-secondary-foreground',
        tone === 'success' && 'bg-status-success-background text-status-success',
        tone === 'danger' && 'bg-destructive/10 text-destructive',
        tone === 'neutral' && 'bg-secondary text-muted-foreground'
      )}
    >
      {tone === 'working' ? (
        <span aria-hidden className="size-1.5 rounded-full bg-agent-working" />
      ) : null}
      {children}
    </span>
  )
}

/**
 * The one list row: an optional leading glyph, a primary line, at most one muted line, and an
 * optional trailing slot. The whole row is the tap target, so it carries no chevron.
 */
export function PhoneRow({
  leading,
  title,
  subtitle,
  trailing,
  onClick,
  ...rest
}: {
  leading?: React.ReactNode
  title: React.ReactNode
  subtitle?: React.ReactNode
  trailing?: React.ReactNode
  onClick?: () => void
} & Partial<Record<`data-${string}`, string>> &
  Pick<React.AriaAttributes, 'aria-expanded'>): React.JSX.Element {
  const body = (
    <>
      {leading ? (
        <span className="flex size-6 shrink-0 items-center justify-center text-muted-foreground">
          {leading}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base leading-snug font-medium">{title}</span>
        {subtitle ? (
          <span className="mt-0.5 block truncate text-[13px] leading-snug text-muted-foreground">
            {subtitle}
          </span>
        ) : null}
      </span>
      {trailing ? <span className="flex shrink-0 items-center">{trailing}</span> : null}
    </>
  )
  // Why the inset: the section's hairline above this row starts where its text does.
  const className = cn(
    'flex min-h-15 w-full items-center gap-3 px-4 py-2.5 text-left',
    leading && '[--phone-row-inset:3.25rem]'
  )
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(className, 'active:bg-accent')} {...rest}>
      {body}
    </button>
  ) : (
    <div className={className} {...rest}>
      {body}
    </div>
  )
}

/** A quiet note inside a section, for empty or loading lists. */
export function PhoneSectionNote({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <p className="px-4 py-3.5 text-[13px] text-muted-foreground">{children}</p>
}

/** A calm empty or unavailable state, centred in the screen. */
export function PhoneEmptyState({
  icon: Icon,
  title,
  children
}: {
  icon: LucideIcon
  title: string
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center px-10 py-14 text-center">
      <Icon className="size-7 text-muted-foreground" aria-hidden />
      <p className="mt-3 text-base font-medium">{title}</p>
      {children ? (
        <div className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{children}</div>
      ) : null}
    </div>
  )
}
