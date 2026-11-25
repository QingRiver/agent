import { getTusharePrompt, readSkillBody } from '@agent/skills/node'
import { getTushareToolset } from '../tools/tushare/toolset'
import { createToolLoopGraph } from './createToolLoopGraph'

export { buildTushareToolset } from '../tools/tushare/toolset'

/** system prompt 取自 skill body（单一源）：tushare 行情分析 + clarify_ask 纪律。 */
export const tushareGraph = createToolLoopGraph({
  tools: async () => (await getTushareToolset()).tools,
  system: `${getTusharePrompt()}\n\n${readSkillBody('clarify-ask')}`,
})
