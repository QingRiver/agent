import { WEATHER_SYSTEM_PROMPT, weatherTools } from '@cli/agent/weather'
import { OpenAIDriver } from '@core/driver/openai'
import { boot } from './boot'

// ==========================================
// 入口
// ==========================================

boot(new OpenAIDriver(), weatherTools, WEATHER_SYSTEM_PROMPT)
