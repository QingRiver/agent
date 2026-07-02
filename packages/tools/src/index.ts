import { obsidian } from './obsidian'
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
export { obsidian, openMeteo, tushare }

export { createTushareMcp, TOKEN_HINT } from './mcp/tushareClient'
export { renderTushareSystemPrompt, TUSHARE_SYSTEM_PROMPT } from './mcp/tusharePrompt'
export type { ObsidianSearchResponse, ObsidianSearchResult } from './obsidian'
export { createSchemaFromPrompt, extractTemplateVariables, renderPrompt } from './promptTemplate'
export type { DailyRow, RealtimeQuoteRow, StockBasicRow } from './tushare'
