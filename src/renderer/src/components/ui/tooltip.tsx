import * as React from 'react'
import * as TooltipPrimitive from 'radix-ui/tooltip'

import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

function TooltipProvider({
  delayDuration = 0,
  disableHoverableContent = true,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  // Why: app tooltips are non-interactive labels. Letting the floating
  // content keep itself open can block the controls it is describing.
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      disableHoverableContent={disableHoverableContent}
      {...props}
    />
  )
}

function Tooltip({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

const TAB_PREVIEW_CLASSES =
  'w-64 max-w-[calc(100vw-1rem)] rounded-xl p-3 surface-floating motion-safe:animate-in motion-safe:fade-in-0 data-[state=closed]:animate-none'

const tooltipContentVariants = cva('z-[90] rounded-lg text-xs', {
  variants: {
    variant: {
      // An ink label (paper on dark) that pops from its control, then only fades between controls.
      default:
        'pointer-events-none w-fit origin-(--radix-tooltip-content-transform-origin) bg-foreground px-2.5 py-1.5 font-medium text-balance text-background shadow-floating motion-tooltip',
      'tab-preview': ['pointer-events-none', TAB_PREVIEW_CLASSES],
      // Why: a preview with its own controls takes the pointer; pair it with hoverable content.
      'tab-preview-interactive': TAB_PREVIEW_CLASSES
    }
  },
  defaultVariants: { variant: 'default' }
})

function TooltipContent({
  className,
  sideOffset = 0,
  showArrow = true,
  variant,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content> &
  VariantProps<typeof tooltipContentVariants> & { showArrow?: boolean; onPlaced?: () => void }) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        // Why: tooltip portals can be triggered from inside menus/popovers.
        // Keep labels above those floating surfaces instead of hidden behind them.
        className={cn(tooltipContentVariants({ variant }), className)}
        {...props}
      >
        {children}
        {showArrow ? (
          <TooltipPrimitive.Arrow className="size-2 translate-y-[calc(-50%_-_1px)] rotate-45 rounded-[2px] bg-foreground fill-foreground" />
        ) : null}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
