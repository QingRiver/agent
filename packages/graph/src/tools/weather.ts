import { openMeteo } from '@agent/tools'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { ASK_TOOLS } from './ask-tools'

export const getWeatherTool = tool(
  async ({ location }) => {
    try {
      return await openMeteo.fetchWeatherByCity(location)
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return `查询「${location}」天气失败：${message}`
    }
  },
  {
    name: 'get_weather',
    description: '根据城市名称查询当前真实天气（Open-Meteo 地理编码 + 预报）。',
    schema: z.object({
      location: z.string().describe('城市名称，如：北京、上海、Tokyo'),
    }),
  },
)

export const WEATHER_TOOLS = [getWeatherTool, ...ASK_TOOLS]
