'use client'

import * as React from 'react'
import type { VariantProps } from 'class-variance-authority'
import * as ToggleGroupPrimitive from 'radix-ui/toggle-group'

import { cn } from '@/lib/utils'
import { toggleVariants } from '@/components/ui/toggle'
import { SegmentIndicator, useSegmentIndicator } from './segment-indicator'

const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants> & {
    spacing?: number
    segmented?: boolean
  }
>({
  size: 'default',
  variant: 'default',
  spacing: 0,
  segmented: false
})

function ToggleGroup({
  className,
  variant,
  size,
  spacing = 0,
  children,
  ref,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
  VariantProps<typeof toggleVariants> & {
    spacing?: number
  }) {
  // Why: one choice from joined options reads as a pill segmented control with a sliding highlight.
  const segmented =
    props.type === 'single' && spacing === 0 && (variant === 'outline' || variant === 'segmented')
  const setRoot = useSegmentIndicator<HTMLDivElement>('[data-state="on"]', segmented, ref)
  const contextValue = React.useMemo(
    () => ({ variant, size, spacing, segmented }),
    [variant, size, spacing, segmented]
  )

  return (
    <ToggleGroupPrimitive.Root
      ref={setRoot}
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      data-spacing={spacing}
      data-segmented={segmented || undefined}
      style={{ '--gap': spacing } as React.CSSProperties}
      className={cn(
        'group/toggle-group flex w-fit items-center gap-[--spacing(var(--gap))] rounded-md data-[spacing=default]:data-[variant=outline]:shadow-xs',
        'data-[segmented=true]:relative data-[segmented=true]:gap-0.5 data-[segmented=true]:rounded-full data-[segmented=true]:bg-muted data-[segmented=true]:p-0.5',
        className
      )}
      {...props}
    >
      {segmented ? <SegmentIndicator /> : null}
      <ToggleGroupContext.Provider value={contextValue}>{children}</ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  )
}

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> & VariantProps<typeof toggleVariants>) {
  const context = React.useContext(ToggleGroupContext)

  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      data-variant={context.variant || variant}
      data-size={context.size || size}
      data-spacing={context.spacing}
      className={cn(
        toggleVariants({
          variant: context.segmented ? 'segment' : context.variant || variant,
          size: context.size || size
        }),
        'w-auto min-w-0 shrink-0 px-3 focus:z-10 focus-visible:z-10 data-[size=xs]:px-2',
        !context.segmented &&
          'data-[spacing=0]:rounded-none data-[spacing=0]:shadow-none data-[spacing=0]:first:rounded-l-md data-[spacing=0]:last:rounded-r-md data-[spacing=0]:data-[variant=outline]:border-l-0 data-[spacing=0]:data-[variant=outline]:first:border-l',
        className
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  )
}

export { ToggleGroup, ToggleGroupItem }
