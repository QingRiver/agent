import type { ToolCallMessagePartProps } from '@assistant-ui/react'
import {
  WeatherCurrentCard,
  WeatherCurrentPropsSchema,
} from '@agent/ui'

function WeatherCurrentSkeleton() {
  return (
    <div className="h-28 max-w-sm animate-pulse rounded-lg border border-border bg-muted" />
  )
}

/** 后端 `weather_current` 的消息内渲染。参数未齐时先出骨架。 */
export function WeatherCurrentToolRender({
  args,
  status,
}: ToolCallMessagePartProps<Record<string, unknown>>) {
  const parsed = WeatherCurrentPropsSchema.safeParse(args)
  if (!parsed.success || status.type === 'running') {
    return <WeatherCurrentSkeleton />
  }
  return <WeatherCurrentCard {...parsed.data} />
}
