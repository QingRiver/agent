import type { AvailabilityFilter } from '@agent/gtd'
import { AVAILABILITY_FILTER, AVAILABILITY_FILTER_TEXT } from '@agent/gtd'
import { cn } from '@lib/utils'

const ORDER = [
  AVAILABILITY_FILTER.AVAILABLE,
  AVAILABILITY_FILTER.REMAINING,
  AVAILABILITY_FILTER.ALL,
] as const

/** 选中档位 → 边框从左覆盖的段数（可执行⊂未完成⊂全部） */
function spanFor(value: AvailabilityFilter): 1 | 2 | 3 {
  if (value === AVAILABILITY_FILTER.AVAILABLE)
    return 1
  if (value === AVAILABILITY_FILTER.REMAINING)
    return 2
  return 3
}

export function GtdAvailabilityFilter({
  value,
  onChange,
  className,
}: {
  value: AvailabilityFilter
  onChange: (next: AvailabilityFilter) => void
  className?: string
}) {
  const span = spanFor(value)

  return (
    <div
      role="radiogroup"
      aria-label="可用性"
      className={cn(
        'relative flex h-8 shrink-0 rounded-lg border border-border/60 bg-muted/80 p-0.5',
        className,
      )}
    >
      {/* 累积边框：从左盖住 1/2/3 段，宽度过渡 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0.5 left-0.5 z-0 rounded-md border-2 border-foreground/80 shadow-sm transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ width: `calc((100% - 0.25rem) * ${span} / 3)` }}
      />
      {ORDER.map((key) => {
        const selected = value === key
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={selected}
            className={cn(
              'relative z-10 h-full min-w-14 flex-1 rounded-md px-2.5 text-xs transition-colors duration-200',
              selected
                ? 'font-semibold text-foreground'
                : 'font-normal text-muted-foreground hover:text-foreground/80',
            )}
            onClick={() => onChange(key)}
          >
            {AVAILABILITY_FILTER_TEXT[key]}
          </button>
        )
      })}
    </div>
  )
}
