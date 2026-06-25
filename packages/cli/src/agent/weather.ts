import type { ToolDef } from '@core/types'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions/completions'
import { openMeteo } from '@agent/tools'
import { Effect } from 'effect'

// ==========================================
// 天气工具定义(ToolDef)—— safe 只读,无权限闸门
// 参数索取(补城市/选附加项)交由 AI 调用 interact 工具(ask_input/ask_multi_choice)
// ==========================================

const WEATHER_EXTRAS = ['code', 'english', 'time'] as const

const weatherTool: ToolDef = {
  schema: {
    type: 'function',
    function: {
      name: 'get_weather',
      description: '查询指定城市的当前天气。若用户未提供城市或附加展示项,先用 ask_input / ask_multi_choice 询问,不要臆测。',
      parameters: {
        type: 'object',
        properties: {
          city: {
            type: 'string',
            description: '城市名称,如"北京"、"上海"、"Tokyo"',
          },
          extras: {
            type: 'array',
            items: { type: 'string', enum: [...WEATHER_EXTRAS] },
            description: '附加展示项(可选): code=天气代码, english=英文地名, time=查询时间',
          },
        },
        required: ['city'],
      },
    },
  },

  /**
   * execute 是 Effect,error channel 为 never:用 Effect.match 消化异步错误为返回字符串。
   * 不再有 confirm 三步——参数索取由 AI 用 interact 工具完成。
   */
  execute: args => Effect.gen(function* () {
    const city = args.city as string
    const extras = new Set(((args.extras as string[] | undefined) ?? []))

    const place = yield* Effect.promise(() => openMeteo.getCoordinates(city)).pipe(
      Effect.match({ onFailure: () => null, onSuccess: p => p }),
    )
    if (!place)
      return `找不到城市「${city}」,请检查名称或尝试英文名。`

    const current = yield* Effect.promise(() => openMeteo.getCurrentWeather(place.latitude, place.longitude)).pipe(
      Effect.match({ onFailure: () => null, onSuccess: c => c }),
    )
    if (!current)
      return `查询「${city}」天气数据失败,请稍后重试。`

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
  }),
}

// ==========================================
// 天气 Agent 配置
// ==========================================

const WEATHER_SYSTEM_PROMPT = [
  '你是天气查询助手。',
  '当用户没有提供城市名时,调用 ask_input 工具询问用户,不要臆测。',
  '若需要附加展示项,调用 ask_multi_choice 让用户选择(code/english/time)。',
  '只有当用户明确提供了城市名时才调用 get_weather 工具。',
  '工具调用后,基于查询结果用简洁友好的语言回复用户。',
].join('\n')

const weatherTools: ToolDef[] = [weatherTool]

/** 构造天气 agent 的初始 LLM 消息(含 system) */
function weatherInitialMessages(): ChatCompletionMessageParam[] {
  return [{ role: 'system', content: WEATHER_SYSTEM_PROMPT }]
}

export { WEATHER_SYSTEM_PROMPT, weatherInitialMessages, weatherTools }
