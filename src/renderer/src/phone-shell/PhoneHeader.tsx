import { ChevronLeft, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PhoneHeaderMenu } from './PhoneHeaderMenu'

/** One screen's title bar: back for nested screens, the title, then screen actions and More. */
export function PhoneHeader({
  title,
  subtitle,
  onBack,
  actions,
  destructiveAction
}: {
  title: string
  subtitle?: string
  onBack?: () => void
  actions?: React.ReactNode
  /** The screen's one destructive action, offered last in the More menu. */
  destructiveAction?: { label: string; run: () => void } | null
}): React.JSX.Element {
  return (
    <header
      className="flex shrink-0 items-center gap-1 border-b border-border bg-background pt-[env(safe-area-inset-top)] pr-[max(env(safe-area-inset-right),0.25rem)] pl-[max(env(safe-area-inset-left),0.25rem)]"
      data-phone-header=""
    >
      {onBack ? (
        <button
          type="button"
          aria-label="Back"
          onClick={onBack}
          className="flex size-11 shrink-0 items-center justify-center rounded-md text-foreground active:bg-accent"
        >
          <ChevronLeft className="size-6" aria-hidden />
        </button>
      ) : (
        <span aria-hidden className="w-3 shrink-0" />
      )}
      <div className="flex min-h-13 min-w-0 flex-1 flex-col justify-center">
        {/* Why larger at the root: tab screens are destinations; nested titles name a thing. */}
        <h1
          className={cn(
            'truncate leading-tight',
            onBack ? 'text-[17px] font-semibold' : 'text-xl font-bold'
          )}
        >
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-0.5 truncate text-[13px] leading-tight text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions}
      <PhoneHeaderMenu destructiveAction={destructiveAction} />
    </header>
  )
}

/** An icon-only header action with a 44px touch target. */
export function PhoneHeaderAction({
  label,
  icon: Icon,
  onClick
}: {
  label: string
  icon: LucideIcon
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground active:bg-accent"
    >
      <Icon className="size-5" aria-hidden />
    </button>
  )
}
