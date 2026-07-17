import { Button } from '@components/ui/button'
import { Calendar } from '@components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover'
import { cn } from '@lib/utils'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { CalendarIcon, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { zhCN as dayPickerZhCN } from 'react-day-picker/locale'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function parseIso(iso: string | null): Date | undefined {
  if (!iso)
    return undefined
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? undefined : d
}

function combineDateAndTime(date: Date, time: string): string {
  const [h = '0', m = '0'] = time.split(':')
  const next = new Date(date)
  next.setHours(Number(h), Number(m), 0, 0)
  return next.toISOString()
}

interface GtdDateTimeFieldProps {
  label: string
  value: string | null
  onChange: (iso: string | null) => void
  className?: string
}

export function GtdDateTimeField({ label, value, onChange, className }: GtdDateTimeFieldProps) {
  const [open, setOpen] = useState(false)
  const selected = useMemo(() => parseIso(value), [value])
  const timeValue = selected
    ? `${pad(selected.getHours())}:${pad(selected.getMinutes())}`
    : '09:00'

  const display = selected
    ? format(selected, 'yyyy-MM-dd HH:mm', { locale: zhCN })
    : '选择日期时间'

  return (
    <div className={cn('space-y-1', className)}>
      <div className="text-xs text-slate-500">{label}</div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              'h-9 w-full justify-start gap-2 border-slate-700 bg-slate-900/50 px-3 font-normal hover:bg-slate-800',
              !selected && 'text-slate-500',
            )}
          >
            <CalendarIcon className="size-3.5 shrink-0 text-slate-400" />
            <span className="truncate">{display}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto overflow-hidden p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(day) => {
              if (!day) {
                onChange(null)
                return
              }
              onChange(combineDateAndTime(day, timeValue))
            }}
            locale={dayPickerZhCN}
          />
          <div className="flex items-center gap-2 border-t border-slate-800 px-3 py-2">
            <input
              type="time"
              value={timeValue}
              onChange={(e) => {
                const base = selected ?? new Date()
                onChange(combineDateAndTime(base, e.target.value || '09:00'))
              }}
              className="h-8 flex-1 rounded-md border border-slate-700 bg-slate-950 px-2 text-sm text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-slate-400"
              disabled={!selected}
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
            >
              <X className="size-3.5" />
              清除
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
