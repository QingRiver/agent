import { Button } from '@components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@components/ui/card'
import { ThemeStore } from '@stores/theme-store'
import { useAtomValue } from 'jotai'
import { generateColorScale, getPrimaryHue, SCALE_STEPS } from '../../theme/color'

export function ThemePreview() {
  const hue = useAtomValue(ThemeStore.hueAtom)
  const saturation = useAtomValue(ThemeStore.saturationAtom)
  const scheme = useAtomValue(ThemeStore.schemeAtom)
  const mode = useAtomValue(ThemeStore.modeAtom)
  const isDark = mode === 'dark'
  const primaryHue = getPrimaryHue(hue, scheme)
  const surface = generateColorScale(hue, saturation, isDark)
  const primary = generateColorScale(primaryHue, saturation, isDark)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">换肤预览</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          以下使用 shadcn 语义 token（background / primary / muted …），随基础色与亮暗模式更新。
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>卡片</CardTitle>
            <CardDescription>card / muted-foreground</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button>Primary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button className="bg-destructive text-white hover:bg-destructive/90">Destructive</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>色板</CardTitle>
            <CardDescription>当前模式 surface / primary 阶</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Surface</p>
              <div className="flex h-8 overflow-hidden rounded-md border border-border">
                {SCALE_STEPS.map(step => (
                  <div
                    key={`s-${step}`}
                    className="flex-1"
                    style={{ backgroundColor: surface[step] }}
                  />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Primary</p>
              <div className="flex h-8 overflow-hidden rounded-md border border-border">
                {SCALE_STEPS.map(step => (
                  <div
                    key={`p-${step}`}
                    className="flex-1"
                    style={{ backgroundColor: primary[step] }}
                  />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        <p>
          页面背景为
          {' '}
          <code className="rounded bg-background px-1 text-foreground">bg-background</code>
          ，主色按钮为
          {' '}
          <code className="rounded bg-background px-1 text-foreground">bg-primary</code>
          。
          Destructive 不随色轮变化。
        </p>
      </div>
    </div>
  )
}
