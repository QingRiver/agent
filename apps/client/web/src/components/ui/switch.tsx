import type { ComponentProps } from 'react'
import { cn } from '@lib/utils'

export interface SwitchProps extends Omit<ComponentProps<'button'>, 'onChange' | 'role'> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

/**
 * 轻量 switch（不引入 @radix-ui/react-switch）。
 * 轨道 / 拇指走 CSS 变量，亮暗色均靠 --input / --primary / --background。
 */
export function Switch({
  className,
  checked = false,
  onCheckedChange,
  disabled,
  ...props
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent shadow-sm transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-input',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none block size-4 rounded-full bg-background shadow-md ring-0 transition-transform',
          'dark:bg-card',
          checked ? 'translate-x-4.5' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}
