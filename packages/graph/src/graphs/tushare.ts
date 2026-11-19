import { ASK_TOOLS_SYSTEM_PROMPT } from '@agent/proto'
import { TUSHARE_SYSTEM_PROMPT } from '@agent/tools'
import { getTushareToolset } from '../tools/tushare/toolset'
import { createToolLoopGraph } from './createToolLoopGraph'

export { buildTushareToolset } from '../tools/tushare/toolset'

/** tools 直接挂 LazyToolNode，避免外层 toolNode.invoke 双发 TOOL_CALL_START */
export const tushareGraph = createToolLoopGraph({
  tools: async () => (await getTushareToolset()).tools,
  system: `${TUSHARE_SYSTEM_PROMPT}\n\n${ASK_TOOLS_SYSTEM_PROMPT}`,
})
