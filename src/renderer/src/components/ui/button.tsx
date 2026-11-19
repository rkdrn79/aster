import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import * as Slot from 'radix-ui/slot'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "press-scale inline-flex shrink-0 items-center justify-center gap-2 cursor-pointer text-sm font-medium whitespace-nowrap outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // The one strong action in a flow: ink (white on dark), or the user's accent.
        default: 'bg-primary text-primary-foreground shadow-raised hover:bg-primary/88',
        destructive:
          'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40',
        outline:
          'border border-border bg-raised text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-secondary dark:hover:bg-accent',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-accent',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        // The worktree card's "rename failed" chip, for a failure the user can open.
        'destructive-chip':
          'border border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive'
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        xs: "h-6 gap-1 px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-8 gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-10 px-6 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-xs': "size-6 [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
        chip: "h-4 gap-0.5 px-0.5 text-[10px] leading-none has-[>svg]:px-0.5 [&_svg:not([class*='size-'])]:size-2.5"
      }
    },
    compoundVariants: [
      // One control radius for every variant: 10 at the regular sizes, 8 at xs, 4 on the tiny chip.
      { size: ['default', 'sm', 'lg', 'icon', 'icon-sm', 'icon-lg'], className: 'rounded-lg' },
      { size: ['xs', 'icon-xs'], className: 'rounded-md' },
      { size: 'chip', className: 'rounded' }
    ],
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

const Button = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<'button'> &
    VariantProps<typeof buttonVariants> & {
      asChild?: boolean
    }
>(function Button(
  { className, variant = 'default', size = 'default', asChild = false, ...props },
  ref
) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      ref={ref}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
})

export { Button, buttonVariants }
