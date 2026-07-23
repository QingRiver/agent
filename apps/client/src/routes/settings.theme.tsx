import { ThemePanel } from '@components/theme/ThemePanel'
import { ThemePreview } from '@components/theme/ThemePreview'
import { ThemeStore } from '@stores/theme-store'
import { createFileRoute } from '@tanstack/react-router'
import { useAtomValue } from 'jotai'

export const Route = createFileRoute('/settings/theme')({
  component: ThemeSettingsPage,
})

function ThemeSettingsPage() {
  const hue = useAtomValue(ThemeStore.hueAtom)
  const saturation = useAtomValue(ThemeStore.saturationAtom)
  const scheme = useAtomValue(ThemeStore.schemeAtom)
  const mode = useAtomValue(ThemeStore.modeAtom)
  const customized = useAtomValue(ThemeStore.customizedAtom)

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">主题</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          用色轮定制基础色，自动生成亮/暗两套 shadcn 换肤变量。亮暗切换只改
          {' '}
          <code className="rounded bg-muted px-1">.dark</code>
          class。
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[340px_1fr]">
        <ThemePanel
          hue={hue}
          scheme={scheme}
          saturation={saturation}
          isDark={mode === 'dark'}
          customized={customized}
          onHueChange={h => ThemeStore.setHue(h)}
          onSchemeChange={s => ThemeStore.setScheme(s)}
          onSaturationChange={s => ThemeStore.setSaturation(s)}
          onToggleDark={() => ThemeStore.toggleMode()}
          onReset={() => ThemeStore.resetBase()}
        />
        <ThemePreview />
      </div>
    </div>
  )
}
