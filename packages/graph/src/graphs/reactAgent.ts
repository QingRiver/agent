import type { StructuredToolInterface } from '@langchain/core/tools'
import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import { loadBuiltInSkills } from '@agent/skills/node'
import {
  composeReactAgentSystemPrompt,
  sanitizeUserPrompt,
} from '../prompts/reactAgentPrompts'
import { materializeSkillTools } from '../skills/materializeSkillTools'
import { ASK_TOOLS } from '../tools/ask-tools'
import { KB_TOOLS } from '../tools/kb'
import { readSkillFileTool } from '../tools/read-skill-file'
import { WEATHER_TOOLS } from '../tools/weather'
import { createToolLoopGraph } from './createToolLoopGraph'

/** 固定核心工具；skill 声明的工具（脚本/MCP）在其基础上物化追加。 */
const CORE_TOOLS = [...KB_TOOLS, ...ASK_TOOLS, ...WEATHER_TOOLS, readSkillFileTool]

// 内置 skill 声明的工具物化一次缓存。当前内置 skill 未声明工具 → 返回空，行为不变。
// Phase 3 weather 脚本化 / tushare MCP 内置后自动生效。
let skillToolsPromise: Promise<StructuredToolInterface[]> | null = null
function getSkillTools(): Promise<StructuredToolInterface[]> {
  if (!skillToolsPromise) {
    skillToolsPromise = loadBuiltInSkills().then(materializeSkillTools)
    skillToolsPromise.catch(() => {
      skillToolsPromise = null
    })
  }
  return skillToolsPromise
}

const tools = async () => [...CORE_TOOLS, ...await getSkillTools()]

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
