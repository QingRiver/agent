import type { ComponentProps } from 'react'
import type { ChevronProps, DayButtonProps } from 'react-day-picker'
import { cn } from '@lib/utils'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { DayPicker } from 'react-day-picker'

import 'react-day-picker/style.css'

export type CalendarProps = ComponentProps<typeof DayPicker>

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('rdp-gtd p-3', className)}
      classNames={{
        root: 'w-fit',
        months: 'relative flex flex-col gap-3',
        month: 'flex w-full flex-col gap-3',
        month_caption: 'flex h-8 items-center justify-center px-8',
        caption_label: 'text-sm font-medium text-slate-100',
        nav: 'absolute inset-x-0 top-0 flex items-center justify-between px-1',
        button_previous:
          'inline-flex size-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100',
        button_next:
          'inline-flex size-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100',
        weekdays: 'flex',
        weekday: 'w-8 text-center text-[0.7rem] font-medium text-slate-500',
        week: 'mt-1 flex w-full',
        day: 'relative h-8 w-8 p-0 text-center text-sm',
        day_button:
          'inline-flex size-8 items-center justify-center rounded-md text-slate-200 hover:bg-slate-800',
        selected: '[&_button]:bg-primary [&_button]:text-primary-foreground [&_button]:hover:bg-primary/90',
        today: '[&_button]:font-semibold [&_button]:text-primary',
        outside: '[&_button]:text-slate-600',
        disabled: '[&_button]:opacity-40',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: CalendarChevron,
        DayButton: CalendarDayButton,
      }}
      {...props}
    />
  )
}

function CalendarChevron({ orientation, className, ...props }: ChevronProps) {
  const Icon = orientation === 'left' ? ChevronLeft : ChevronRight
  return <Icon className={cn('size-4', className)} {...props} />
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: DayButtonProps) {
  return (
    <button
      type="button"
      data-day={day.date.toLocaleDateString()}
      className={cn(
        'inline-flex size-8 items-center justify-center rounded-md text-sm text-slate-200',
        'hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        modifiers.selected && 'bg-primary text-primary-foreground hover:bg-primary/90',
        modifiers.today && !modifiers.selected && 'font-semibold text-primary',
        modifiers.outside && 'text-slate-600',
        modifiers.disabled && 'opacity-40',
        className,
      )}
      {...props}
    />
  )
}
