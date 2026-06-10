import type { LabelHTMLAttributes } from 'react'
import { cn } from '@lib/utils'
import * as LabelPrimitive from '@radix-ui/react-label'

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <LabelPrimitive.Root
      className={cn('text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70', className)}
      {...props}
    />
  )
}
