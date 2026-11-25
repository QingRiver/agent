import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { renderCodeCardTool } from './code-card'

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
 * `get_weather` 已迁至 weather skill（`@agent/skills/skills/weather/`）：
 * 自包含 `scripts/weather.mjs` 取 Open-Meteo，经 `materializeSkillTools` 物化进 reactAgent。
 * 本文件只保留 UI 同名回执工具 `weather_current` 与 `render_code_card`。
 */

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

export const WEATHER_TOOLS = [weatherCurrentTool, renderCodeCardTool]

export {
  RENDER_CODE_CARD_TOOL_NAME,
  renderCodeCardTool,
} from './code-card'
