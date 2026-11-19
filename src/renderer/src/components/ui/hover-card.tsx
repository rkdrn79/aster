'use client'

import * as React from 'react'
import * as HoverCardPrimitive from 'radix-ui/hover-card'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

function HoverCard({ ...props }: React.ComponentProps<typeof HoverCardPrimitive.Root>) {
  return <HoverCardPrimitive.Root data-slot="hover-card" {...props} />
}

function HoverCardTrigger({ ...props }: React.ComponentProps<typeof HoverCardPrimitive.Trigger>) {
  return <HoverCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />
}

const hoverCardContentVariants = cva('', {
  variants: {
    variant: {
      default: 'w-64 p-4',
      'workspace-details':
        'w-[360px] max-w-[calc(100vw-2rem)] max-h-[28rem] overflow-y-auto p-3 text-xs scrollbar-sleek'
    }
  },
  defaultVariants: { variant: 'default' }
})

function HoverCardContent({
  className,
  variant,
  align = 'center',
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Content> &
  VariantProps<typeof hoverCardContentVariants>) {
  return (
    <HoverCardPrimitive.Portal data-slot="hover-card-portal">
      <HoverCardPrimitive.Content
        data-slot="hover-card-content"
        align={align}
        sideOffset={sideOffset}
        // Why: matches the dropdown-menu recipe — translucent surface, solid
        // 14% border, dual shadow, and 2xl backdrop blur. The previous
        // border-border/50 + bg-popover made the hover card blend into the
        // dark canvas (#171717 vs #0a0a0a, ~3% white lift) with a near-
        // invisible border.
        className={cn(
          'z-50 origin-(--radix-hover-card-content-transform-origin) rounded-xl outline-hidden surface-floating motion-floating',
          hoverCardContentVariants({ variant }),
          className
        )}
        {...props}
      />
    </HoverCardPrimitive.Portal>
  )
}

export { HoverCard, HoverCardTrigger, HoverCardContent }
