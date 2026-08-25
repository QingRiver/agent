import { openMeteo } from './openMeteo'
import { tushare } from './tushare'

export type { StockCandidate } from './mcp/stockResolve'

export {
  asString,
  buildStockBasicArgs,
  extractRows,
  findQueryTool,
  findStockBasicTool,
  parseStockCandidates,
  QUERY_TOOL_CANDIDATES,
  queryStockBasic,
  toolErrorMessage,
} from './mcp/stockResolve'
export type { McpTool, TushareMcp } from './mcp/tushareClient'
export { createTushareMcp, TOKEN_HINT } from './mcp/tushareClient'
export { openMeteo, tushare }

export { renderTushareSystemPrompt, TUSHARE_SYSTEM_PROMPT } from './mcp/tusharePrompt'
export type { CurrentWeather } from './openMeteo'
export { createSchemaFromPrompt, extractTemplateVariables, renderPrompt } from './promptTemplate'
export type { DailyRow, RealtimeQuoteRow, StockBasicRow } from './tushare'
