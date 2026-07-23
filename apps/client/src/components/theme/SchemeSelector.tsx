import type { ColorScheme } from '../../theme/color'
import { ChevronDown } from 'lucide-react'
import { generateColorScale, getPrimaryHue, hslToString, SCALE_STEPS } from '../../theme/color'

interface SchemeSelectorProps {
  hue: number
  scheme: ColorScheme
  saturation: number
  isDark: boolean
  onSchemeChange: (scheme: ColorScheme) => void
}

const SCHEME_OPTIONS: { value: ColorScheme, label: string, description: string }[] = [
  { value: 'complementary', label: '互补色', description: '色轮对面 (H+180°)' },
  { value: 'analogous', label: '邻近色', description: '色轮相邻 (H+30°)' },
]

export function SchemeSelector({
  hue,
  scheme,
  saturation,
  isDark,
  onSchemeChange,
}: SchemeSelectorProps) {
  const primaryHue = getPrimaryHue(hue, scheme)
  const surface = generateColorScale(hue, saturation, isDark)
  const primary = generateColorScale(primaryHue, saturation, isDark)

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          配色方案
        </label>
        <div className="relative">
          <select
            value={scheme}
            onChange={e => onSchemeChange(e.target.value as ColorScheme)}
            className="w-full cursor-pointer appearance-none rounded-lg border border-border bg-background px-3 py-2 pr-8 text-sm text-foreground transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          >
            {SCHEME_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
                {' '}
                —
                {opt.description}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col items-center gap-1.5">
          <div
            className="h-10 w-full rounded-lg border border-border shadow-sm transition-colors"
            style={{ backgroundColor: hslToString(hue, 70, 50) }}
          />
          <span className="text-xs text-muted-foreground">基础 Surface</span>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <div
            className="h-10 w-full rounded-lg border border-border shadow-sm transition-colors"
            style={{ backgroundColor: hslToString(primaryHue, 70, 50) }}
          />
          <span className="text-xs text-muted-foreground">主题 Primary</span>
        </div>
      </div>

      <div className="space-y-2">
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Surface 色阶（当前模式）</p>
          <div className="flex h-6 overflow-hidden rounded-lg">
            {SCALE_STEPS.map(step => (
              <div
                key={step}
                className="flex-1 transition-colors"
                style={{ backgroundColor: surface[step] }}
                title={`surface-${step}`}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Primary 色阶（当前模式）</p>
          <div className="flex h-6 overflow-hidden rounded-lg">
            {SCALE_STEPS.map(step => (
              <div
                key={step}
                className="flex-1 transition-colors"
                style={{ backgroundColor: primary[step] }}
                title={`primary-${step}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
