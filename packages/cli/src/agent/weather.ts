import type { ToolDef } from '@core/types'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions/completions'
import { openMeteo } from '@agent/tools'
import { interact } from '@core/agent-effect'
import { Effect } from 'effect'

// ==========================================
// 天气工具定义(ToolDef)—— 多步 HITL
// ==========================================

const EXTRAS_OPTIONS = [
  { label: '天气代码', value: 'code' },
  { label: '英文地名', value: 'english' },
  { label: '查询时间', value: 'time' },
] as const

const weatherTool: ToolDef = {
  schema: {
    type: 'function',
    function: {
      name: 'get_weather',
      description: '查询指定城市的当前天气,需要提供城市名称',
      parameters: {
        type: 'object',
        properties: {
          city: {
            type: 'string',
            description: '城市名称,如"北京"、"上海"、"Tokyo"',
          },
        },
        required: ['city'],
      },
    },
  },

  /**
   * 多步人机确认(Effect):input(补城市) → multiSelect(附加项) → modal(确认)
   * 通过 `yield* interact(...)` 转出控制权,与主调度循环无缝组合。任意一步取消即 return null。
   */
  confirm: args =>
    Effect.gen(function* () {
      // 1. 若 LLM 未给城市,先输入补全
      if (!args.city) {
        const r = yield* interact({ type: 'input', message: '请输入要查询的城市:', placeholder: '北京' })
        args = { ...args, city: (r.payload as { value: string }).value }
      }

      // 2. 附加展示项(多选,可空)
      const m = yield* interact({
        type: 'multiSelect',
        message: '选择附加展示项(空格选择,回车确认)',
        options: [...EXTRAS_OPTIONS],
      })
      args = { ...args, extras: (m.payload as { values: string[] }).values }

      // 3. 确认执行
      const c = yield* interact({
        type: 'modal',
        title: '确认查询',
        body: `查询 ${(args.city as string)} 的天气?`,
        actions: ['确认', '取消'],
      })
      if ((c.payload as { action: string }).action === '取消')
        return null
      return args
    }),

  execute: async (args) => {
    const city = args.city as string
    const extras = new Set(((args.extras as string[] | undefined) ?? []))

    const place = await openMeteo.getCoordinates(city)
    if (!place)
      return `找不到城市「${city}」,请检查名称或尝试英文名。`

    const current = await openMeteo.getCurrentWeather(place.latitude, place.longitude)
    const lines = [
      `${place.country} ${place.name} 当前天气:`,
      `- 气温:${current.temperature_2m}°C`,
      `- 天气代码:${current.weather_code}`,
    ]
    if (extras.has('english'))
      lines.push(`- English: ${place.name}`)
    if (extras.has('time'))
      lines.push(`- 查询时间:${new Date().toLocaleString('zh-CN')}`)
    return lines.join('\n')
  },
}

// ==========================================
// 天气 Agent 配置
// ==========================================

const WEATHER_SYSTEM_PROMPT = [
  '你是天气查询助手。',
  '当用户没有提供城市名时,用自然语言反问,不要调用工具。',
  '只有当用户明确提供了城市名时才调用 get_weather 工具。',
  '工具调用后,基于查询结果用简洁友好的语言回复用户。',
].join('\n')

const weatherTools: ToolDef[] = [weatherTool]

/** 构造天气 agent 的初始 LLM 消息(含 system) */
function weatherInitialMessages(): ChatCompletionMessageParam[] {
  return [{ role: 'system', content: WEATHER_SYSTEM_PROMPT }]
}

export { WEATHER_SYSTEM_PROMPT, weatherInitialMessages, weatherTools }
