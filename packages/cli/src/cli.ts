import { TUSHARE_SYSTEM_PROMPT, tushareTools } from '@cli/agent/tushare'
import { OpenAIDriver } from '@core/driver/openai'
import { boot } from './boot'

// ==========================================
// 入口
// ==========================================

boot(new OpenAIDriver(), tushareTools, TUSHARE_SYSTEM_PROMPT)
