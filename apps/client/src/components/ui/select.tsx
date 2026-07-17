import type { ComponentProps } from 'react'
import { cn } from '@lib/utils'
import { ChevronDown } from 'lucide-react'

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <div className={cn('relative w-full min-w-0', className)}>
      <select
        className={cn(
          'flex h-9 w-full appearance-none rounded-md border border-slate-700 bg-slate-900/50 py-1 pl-3 pr-9 text-sm text-slate-200 shadow-sm transition-colors',
          'hover:border-slate-600',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
        {...props}
      />
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-500"
      />
    </div>
  )
}
