import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import {
  composeReactAgentSystemPrompt,
  sanitizeUserPrompt,
} from '../prompts/reactAgentPrompts'
import { ASK_TOOLS } from '../tools/ask-tools'
import { KB_TOOLS } from '../tools/kb'
import { readSkillFileTool } from '../tools/read-skill-file'
import { createToolLoopGraph } from './createToolLoopGraph'

const tools = [...KB_TOOLS, ...ASK_TOOLS, readSkillFileTool]

function readUserPrompt(config: LangGraphRunnableConfig): string {
  return sanitizeUserPrompt(config.configurable?.userPrompt)
}

function readSkillText(config: LangGraphRunnableConfig): string | undefined {
  const raw = config.configurable?.skillText
  return typeof raw === 'string' && raw.trim() ? raw : undefined
}

/**
 * 环次数唯一由 graph.stream 的 recursionLimit（= 配置 maxSteps）约束。
 * kbId 由 server 写入 configurable，kb_search 自行读取。
 */
export const reactAgentGraph = createToolLoopGraph({
  tools,
  system: (_state, config) =>
    composeReactAgentSystemPrompt(readUserPrompt(config), readSkillText(config)),
})
