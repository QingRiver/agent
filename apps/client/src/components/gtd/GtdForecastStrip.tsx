import type { ForecastStripKey } from '@agent/gtd'
import { FORECAST_STRIP_ORDER, FORECAST_STRIP_TEXT } from '@agent/gtd'
import { cn } from '@lib/utils'
import {
  forecastStripSegmentState,
  selectedStripBounds,
} from '../../gtd/forecast-strip'

export function GtdForecastStrip({
  value,
  onToggle,
  className,
}: {
  value: readonly ForecastStripKey[]
  onToggle: (key: ForecastStripKey) => void
  className?: string
}) {
  const bounds = selectedStripBounds(value, FORECAST_STRIP_ORDER)
  const lo = bounds?.lo ?? 0
  const hi = bounds?.hi ?? 0
  const span = bounds == null ? 0 : hi - lo + 1
  const n = FORECAST_STRIP_ORDER.length

  return (
    <div
      role="group"
      aria-label="预测时段"
      className={cn(
        'relative flex h-8 min-w-0 rounded-lg border border-border/60 bg-muted/80 p-0.5',
        className,
      )}
    >
      {span > 0 && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0.5 z-0 rounded-md border-2 border-foreground/80 shadow-sm transition-[left,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{
            left: `calc(0.125rem + (100% - 0.25rem) * ${lo} / ${n})`,
            width: `calc((100% - 0.25rem) * ${span} / ${n})`,
          }}
        />
      )}
      {FORECAST_STRIP_ORDER.map((key, index) => {
        const state = forecastStripSegmentState(index, lo, hi)
        const selected = state === 'active'
        return (
          <button
            key={key}
            type="button"
            aria-pressed={selected}
            className={cn(
              'relative z-10 h-full flex-1 cursor-pointer rounded-md px-2 text-xs transition-colors duration-200',
              selected
                ? 'font-semibold text-foreground'
                : 'font-normal text-muted-foreground hover:text-foreground/80',
            )}
            onClick={() => onToggle(key)}
          >
            {FORECAST_STRIP_TEXT[key]}
          </button>
        )
      })}
    </div>
  )
}
