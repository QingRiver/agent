import type { VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'
import { cn } from '@lib/utils'
import { cva } from 'class-variance-authority'

const badgeVariants = cva(
  'inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        neutral: 'bg-muted/40 text-muted-foreground border-border',
        primary: 'bg-primary/15 text-primary border-primary/30',
        amber: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
        destructive: 'bg-destructive/15 text-destructive border-destructive/30',
        outline: 'bg-transparent text-foreground border-border',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  },
)

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
  VariantProps<typeof badgeVariants> {
}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, className }))} {...props} />
  )
}
