import { Bot, FlaskConical, FolderOpen, House, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePhoneNavigation, type PhoneTab } from './phone-navigation-store'

const TAB_ITEMS: { tab: PhoneTab; label: string; icon: LucideIcon }[] = [
  { tab: 'home', label: 'Home', icon: House },
  { tab: 'agents', label: 'Agents', icon: Bot },
  { tab: 'runs', label: 'Runs', icon: FlaskConical },
  { tab: 'files', label: 'Files', icon: FolderOpen }
]

export const PHONE_TAB_TITLES: Record<PhoneTab, string> = {
  home: 'Home',
  agents: 'Agents',
  runs: 'Runs',
  files: 'Files'
}

/** The fixed bottom navigation; the badge counts sessions waiting on the user. */
export function PhoneTabBar({ needsYouCount }: { needsYouCount: number }): React.JSX.Element {
  const current = usePhoneNavigation((state) => state.tab)
  const selectTab = usePhoneNavigation((state) => state.selectTab)
  return (
    <nav
      aria-label="Sections"
      className="flex shrink-0 border-t border-border bg-background pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
      data-phone-tab-bar=""
    >
      {TAB_ITEMS.map(({ tab, label, icon: Icon }) => {
        const active = tab === current
        const badge = tab === 'agents' && needsYouCount > 0 ? needsYouCount : null
        return (
          <button
            key={tab}
            type="button"
            aria-current={active ? 'page' : undefined}
            aria-label={badge ? `${label}, ${badge} waiting for you` : label}
            onClick={() => selectTab(tab)}
            className={cn(
              'relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-2xs font-medium active:bg-accent',
              active ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            <Icon className="size-5" aria-hidden />
            {label}
            {badge ? (
              <span className="absolute top-1.5 left-[calc(50%+0.375rem)] flex h-4 min-w-4 items-center justify-center rounded-full bg-agent-question px-1 text-3xs font-semibold text-background tabular-nums">
                {badge}
              </span>
            ) : null}
          </button>
        )
      })}
    </nav>
  )
}
