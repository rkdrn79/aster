import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useShortcutKeyDetails } from '@/hooks/useShortcutLabel'
import { EXPERIMENT_PAGE_LABELS, EXPERIMENT_PAGES } from './research-experiment-page'

/** The Experiment's notebook and its Details as one segmented control in the header. */
export function ResearchExperimentPageTabs(): React.JSX.Element {
  const shortcut = useShortcutKeyDetails('research.toggleExperimentDetails')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <TabsList aria-label="Experiment pages">
          {EXPERIMENT_PAGES.map((page) => (
            <TabsTrigger key={page} value={page}>
              {EXPERIMENT_PAGE_LABELS[page]}
            </TabsTrigger>
          ))}
        </TabsList>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        <span className="flex items-center gap-1.5">
          Switch notebook and details
          {shortcut.keys.length > 0 ? (
            <ShortcutKeyCombo
              keys={shortcut.keys}
              doubleTap={shortcut.doubleTap}
              className="gap-0.5"
              keyCapClassName="min-w-0 border-background/20 bg-background/10 px-1 py-0 text-3xs text-background shadow-none"
              separatorClassName="text-3xs text-background/70"
            />
          ) : null}
        </span>
      </TooltipContent>
    </Tooltip>
  )
}
