import type { ColorScheme } from '../../theme/color'
import { Droplets, Moon, Palette, RotateCcw, Sun } from 'lucide-react'
import { ColorWheel } from './ColorWheel'
import { SchemeSelector } from './SchemeSelector'

interface ThemePanelProps {
  hue: number
  scheme: ColorScheme
  saturation: number
  isDark: boolean
  customized?: boolean
  onHueChange: (hue: number) => void
  onSchemeChange: (scheme: ColorScheme) => void
  onSaturationChange: (saturation: number) => void
  onToggleDark: () => void
  onReset?: () => void
}

export function ThemePanel({
  hue,
  scheme,
  saturation,
  isDark,
  customized = false,
  onHueChange,
  onSchemeChange,
  onSaturationChange,
  onToggleDark,
  onReset,
}: ThemePanelProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm backdrop-blur-sm transition-colors">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Palette className="size-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">基础色设置</h2>
        </div>
        <div className="flex items-center gap-1">
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              disabled={!customized}
              className="cursor-pointer rounded-lg bg-muted p-2 text-muted-foreground transition-all hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-40"
              title="恢复默认基础色"
            >
              <RotateCcw className="size-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onToggleDark}
            className="cursor-pointer rounded-lg bg-muted p-2 text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
            title={isDark ? '切换到亮色模式' : '切换到暗色模式'}
          >
            {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
        </div>
      </div>

      <div className="flex flex-col items-center gap-6">
        <ColorWheel hue={hue} onHueChange={onHueChange} />

        <div className="w-full">
          <div className="mb-1.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Droplets className="size-4 text-primary" />
              <label className="text-xs font-medium text-muted-foreground">彩度</label>
            </div>
            <span className="font-mono text-xs text-muted-foreground">
              {saturation}
              %
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={200}
            step={1}
            value={saturation}
            onChange={e => onSaturationChange(Number(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-muted accent-primary"
          />
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>灰调</span>
            <span>标准</span>
            <span>鲜艳</span>
          </div>
        </div>

        <div className="w-full">
          <SchemeSelector
            hue={hue}
            scheme={scheme}
            saturation={saturation}
            isDark={isDark}
            onSchemeChange={onSchemeChange}
          />
        </div>

        {onReset && (
          <button
            type="button"
            onClick={onReset}
            disabled={!customized}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-default disabled:opacity-40"
          >
            <RotateCcw className="size-3.5" />
            恢复默认
          </button>
        )}
      </div>
    </div>
  )
}
