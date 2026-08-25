/**
 * 天气展示卡 —— 非中断只读 View。
 * AI / Skill 只喂扁平 JSON（城市、气温、状况）；换城市等交互走对话 / ask_*，不在本卡上挂按钮。
 */
export function WeatherCurrentCard({
  city,
  country,
  temperatureC,
  condition,
  observedAt,
}: {
  city: string
  country?: string
  temperatureC: number
  condition: string
  observedAt?: string
}) {
  const place = country != null && country !== ''
    ? `${country} · ${city}`
    : city

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4 text-card-foreground">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            当前天气
          </p>
          <h3 className="truncate text-lg font-semibold text-foreground">
            {place}
          </h3>
        </div>
        <div
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 text-2xl"
          aria-hidden
        >
          {conditionEmoji(condition)}
        </div>
      </div>

      <div className="flex items-end gap-3">
        <p className="text-4xl font-semibold tabular-nums tracking-tight text-foreground">
          {formatTemp(temperatureC)}
          <span className="ml-0.5 text-xl font-medium text-muted-foreground">°C</span>
        </p>
        <p className="mb-1 text-sm text-cyan-700 dark:text-cyan-300">
          {condition}
        </p>
      </div>

      {observedAt != null && observedAt !== '' && (
        <p className="text-xs text-muted-foreground">
          观测时间
          {' '}
          {observedAt}
        </p>
      )}
    </div>
  )
}

function formatTemp(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

/** 粗粒度 emoji，仅装饰；真实状况文案以 condition 为准 */
function conditionEmoji(condition: string): string {
  if (/雷/.test(condition))
    return '⛈️'
  if (/雪|凇/.test(condition))
    return '🌨️'
  if (/雨|毛毛/.test(condition))
    return '🌧️'
  if (/雾/.test(condition))
    return '🌫️'
  if (/阴|云/.test(condition))
    return '☁️'
  if (/晴/.test(condition))
    return '☀️'
  return '🌤️'
}
