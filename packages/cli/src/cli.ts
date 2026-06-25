import { INTERACT_SYSTEM_PROMPT, interactTools } from '@cli/agent/interact-tools'
import { WEATHER_SYSTEM_PROMPT, weatherTools } from '@cli/agent/weather'
import { OpenAIDriver } from '@core/driver/openai'
import { boot } from './boot'

// ==========================================
// 入口
// ==========================================

boot(
  new OpenAIDriver(),
  [...weatherTools, ...interactTools],
  [WEATHER_SYSTEM_PROMPT, INTERACT_SYSTEM_PROMPT].join('\n\n'),
)
