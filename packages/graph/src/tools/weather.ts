import { openMeteo } from '@agent/tools'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'

/**
 * 与 `@agent/ui` `WeatherCurrentPropsSchema` / `weather_current` 卡片同形。
 * 刻意不从 `@agent/ui` 或 proto 引入：graph 不依赖 React View；proto 只放中性中断协议。
 */
const weatherCurrentArgsSchema = z.object({
  city: z.string().describe('城市名'),
  country: z.string().optional().describe('国家/地区'),
  temperatureC: z.number().describe('气温（摄氏）'),
  condition: z.string().describe('天气状况文案，如晴、局部多云'),
  observedAt: z.string().optional().describe('观测时间展示文案'),
})

/** 须与 `@agent/ui` WEATHER_CURRENT_TOOL_NAME 一致 */
const WEATHER_CURRENT_TOOL_NAME = 'weather_current' as const

/**
 * 查询真实天气，返回 JSON（对齐天气卡 props）。
 * 前端由同名 `weather_current` + useComponent / useRenderTool 渲染。
 */
export const getWeatherTool = tool(
  async ({ location }) => {
    try {
      const weather = await openMeteo.fetchCurrentWeatherByCity(location)
      if (weather == null) {
        return JSON.stringify({
          ok: false,
          error: `找不到城市「${location}」，请检查名称或尝试英文名。`,
        })
      }
      return JSON.stringify({ ok: true, weather })
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return JSON.stringify({
        ok: false,
        error: `查询「${location}」天气失败：${message}`,
      })
    }
  },
  {
    name: 'get_weather',
    description: '根据城市名称查询当前真实天气（Open-Meteo）。成功时返回 JSON：{ ok:true, weather:{ city, country?, temperatureC, condition } }；失败 { ok:false, error }。查到后必须再调用 weather_current 展示卡片。',
    schema: z.object({
      location: z.string().describe('城市名称，如：北京、上海、Tokyo'),
    }),
  },
)

/**
 * 展示天气卡 —— 与前端 useComponent(`weather_current`) 同名同 schema。
 * 后端执行仅回执；真正 UI 由 Client 按 TOOL_CALL args 渲染。
 */
export const weatherCurrentTool = tool(
  async (props) => {
    const place = props.country != null && props.country !== ''
      ? `${props.country} ${props.city}`
      : props.city
    return `已展示天气卡片：${place} ${props.temperatureC}°C ${props.condition}`
  },
  {
    name: WEATHER_CURRENT_TOOL_NAME,
    description: '在对话中渲染当前天气卡片。参数必须来自 get_weather 成功返回的 weather 字段，禁止臆造气温或状况。',
    schema: weatherCurrentArgsSchema,
  },
)

export const WEATHER_TOOLS = [getWeatherTool, weatherCurrentTool]
