import { ASK_TOOLS_SYSTEM_PROMPT } from '@agent/proto'
import { getHaToolset } from '../tools/ha/toolset'
import { createToolLoopGraph } from './createToolLoopGraph'

const HA_SYSTEM_PROMPT = [
  '你是 Home Assistant 助手，通过 MCP 工具查询与控制已暴露给 Assist 的智能家居实体。',
  '优先使用可用工具完成用户请求；不确定实体或操作时向用户确认。',
  '不要编造未通过工具返回的状态。',
].join('\n')

export { buildHaToolset } from '../tools/ha/toolset'

/** tools 直接挂 LazyToolNode，避免外层 toolNode.invoke 双发 TOOL_CALL_START */
export const haGraph = createToolLoopGraph({
  tools: async () => (await getHaToolset()).tools,
  system: `${HA_SYSTEM_PROMPT}\n\n${ASK_TOOLS_SYSTEM_PROMPT}`,
})
