import type { StockCandidate, TushareMcp } from '@agent/tools'
import type { BaseMessage } from '@langchain/core/messages'
import type { StructuredToolInterface } from '@langchain/core/tools'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import {
  createTushareMcp,
  findQueryTool,
  findStockBasicTool,
  queryStockBasic,
  TOKEN_HINT,
  toolErrorMessage,
  TUSHARE_SYSTEM_PROMPT,
} from '@agent/tools'
import { AIMessage, SystemMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { Annotation, interrupt, StateGraph } from '@langchain/langgraph'
import { ToolNode } from '@langchain/langgraph/prebuilt'
import { ChatOpenAI } from '@langchain/openai'
import { z } from 'zod'
import { ASK_SYSTEM_PROMPT, ASK_TOOLS } from './hitl/ask-tools'
import { mcpToolsToLangchainTools } from './mcp/mcpToLangchain'

/** 中断 select 选项形状（与 hitl/ask-tools 内联类型一致） */
interface AskOption { label: string, value: string, description?: string | undefined }

const TushareState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
})

interface TushareToolset {
  tools: StructuredToolInterface[]
  llmWithTools: ReturnType<ChatOpenAI['bindTools']>
  toolNode: ToolNode
}

/** 多匹配时用 interrupt 弹选择列表（ask_human）—— 与 cli 的 pickStock 同语义，改用 langgraph interrupt */
async function pickStock(stocks: StockCandidate[]): Promise<StockCandidate | null> {
  if (stocks.length === 0)
    return null
  if (stocks.length === 1)
    return stocks[0]!

  const resp = interrupt<
    { type: 'select', message: string, options: AskOption[] },
    { value: string }
  >({
    type: 'select',
    message: '匹配到多只股票，请选择:',
    options: stocks.map(s => ({
      label: `${s.name} (${s.ts_code})`,
      value: s.ts_code,
      ...(s.industry ? { description: s.industry } : {}),
    })),
  })
  return stocks.find(s => s.ts_code === resp.value) ?? null
}

/** resolve_stock 工具：缺名称/代码时 interrupt(input)；多匹配时 interrupt(select)。保留 ask_human */
function createResolveStockTool(mcp: TushareMcp) {
  const stockBasicTool = findStockBasicTool(mcp.tools) ?? findQueryTool(mcp.tools)

  return tool(
    async ({ ts_code, name }) => {
      let code = ts_code
      let nm = name

      if (!code && !nm) {
        const resp = interrupt<
          { type: 'input', message: string, placeholder?: string },
          { value: string }
        >({
          type: 'input',
          message: '请输入股票名称或代码:',
          placeholder: '平安银行 / 000001.SZ',
        })
        const input = resp.value.trim()
        if (input.includes('.'))
          code = input
        else
          nm = input
      }

      if (code)
        return JSON.stringify({ ts_code: code, name: nm ?? null }, null, 2)

      if (!nm)
        return TOKEN_HINT

      if (!stockBasicTool)
        return '未找到 Tushare MCP stock_basic 工具，无法解析股票名称'

      let stocks: StockCandidate[]
      try {
        stocks = await queryStockBasic(mcp, stockBasicTool, { name: nm })
      }
      catch (err) {
        return toolErrorMessage(err)
      }

      const picked = await pickStock(stocks)
      if (!picked)
        return stocks.length === 0 ? `未找到名称「${nm}」对应的股票` : '未选择股票'

      return JSON.stringify({ ts_code: picked.ts_code, name: picked.name }, null, 2)
    },
    {
      name: 'resolve_stock',
      description: '解析股票名称或代码为 ts_code。用户只给简称/模糊名称时必须先调用此工具；多匹配时弹出选择列表。',
      schema: z.object({
        ts_code: z.string().optional().describe('TS 代码，如 000001.SZ'),
        name: z.string().optional().describe('股票名称，支持模糊匹配'),
      }),
    },
  )
}

async function buildTushareToolset(mcp: TushareMcp): Promise<TushareToolset> {
  const tools = [
    ...mcpToolsToLangchainTools(mcp),
    createResolveStockTool(mcp),
    ...ASK_TOOLS,
  ]
  const llm = new ChatOpenAI({
    model: process.env.OPENAI_MODEL ?? '',
    temperature: 0,
  })
  const llmWithTools = llm.bindTools(tools)
  const toolNode = new ToolNode(tools)
  return { tools, llmWithTools, toolNode }
}

export { buildTushareToolset }

/**
 * 懒加载 MCP 工具集：首次调用才连接 Tushare MCP（避免模块加载期强依赖 TUSHARE_TOKEN，
 * 与 weatherGraph 顶层构造不同——MCP 需异步建连）。
 * 失败时重置 promise，允许后续重试建连。
 */
let toolsetPromise: Promise<TushareToolset> | null = null
async function getTushareToolset(): Promise<TushareToolset> {
  if (!toolsetPromise) {
    toolsetPromise = createTushareMcp().then(buildTushareToolset)
    toolsetPromise.catch(() => {
      toolsetPromise = null
    })
  }
  return toolsetPromise
}

/**
 * DeepSeek-v4-flash 在 streamEvents 模式下被 langchain 1.4.7 错置进 content 的 tool_call 块。
 * 特征：type 标为 "text"，但同时带 name/args/id。
 */
interface MisplacedToolCallPart {
  type: 'text'
  text?: string
  name: string
  args: unknown
  id?: string
}

/** 判断是否为 flash 误放进 content 的 tool_call 块 */
function isMisplacedToolCall(part: unknown): part is MisplacedToolCallPart {
  if (typeof part !== 'object' || part === null)
    return false
  const p = part as Record<string, unknown>
  return p.type === 'text' && typeof p.name === 'string' && 'args' in p
}

/** 安全解析 args：字符串尝试 JSON.parse（失败则包成 {raw}），对象原样返回 */
function parseToolArgs(args: unknown): Record<string, unknown> {
  if (typeof args === 'string') {
    try {
      return JSON.parse(args) as Record<string, unknown>
    }
    catch {
      return { raw: args }
    }
  }
  return (args && typeof args === 'object' ? args : {}) as Record<string, unknown>
}

/**
 * langchain 1.4.7 在 streamEvents(stream 模式)下聚合 deepseek-v4-flash 的 stream chunks 时，
 * tool_call 会被错误塞进 `content` 数组（元素含 name/args/id 但 type 标为 text），
 * 而 `tool_calls` 字段为空 → shouldContinue 误判不调工具。
 * 此 workaround 从 content 数组提取误放的 tool_call 重建 tool_calls；v4-pro 等正常模型 tool_calls 已有值，跳过。
 */
function fixMisplacedToolCalls(response: AIMessage): AIMessage {
  // 1. 快速通路：已有 tool_calls 或 content 非数组，直接跳过
  if (response.tool_calls?.length || !Array.isArray(response.content))
    return response

  const toolCalls: NonNullable<AIMessage['tool_calls']> = []

  // 2. 清洗 content：提取错位的 tool_call，剥离 name/args 只留纯 text 块
  //    （langchain 1.x contentBlocks getter 的转换函数对「type:text + name/args」part 处理会抛错）
  const cleanedContent = response.content.map((part) => {
    if (isMisplacedToolCall(part)) {
      toolCalls.push({
        id: part.id ?? `call_${randomUUID()}`,
        name: part.name,
        args: parseToolArgs(part.args),
        type: 'tool_call',
      })
      return { type: 'text' as const, text: part.text ?? '' }
    }
    return part
  })

  // 3. 未检测到错位 tool_call：普通文本回复，原样返回
  if (toolCalls.length === 0)
    return response

  // 4. 用新数组替换 content，避免 arr.length=0 的 in-place hack
  response.content = cleanedContent
  response.tool_calls = toolCalls
  return response
}

async function agent(state: typeof TushareState.State) {
  const { llmWithTools } = await getTushareToolset()
  // 首轮注入 system prompt（tushare 分析框架 + ask_* 引导）；resume 续跑时已含则跳过
  const messages = state.messages[0]?.getType() === 'system'
    ? state.messages
    : [new SystemMessage(`${TUSHARE_SYSTEM_PROMPT}\n\n${ASK_SYSTEM_PROMPT}`), ...state.messages]
  const response = await llmWithTools.invoke(messages)
  return { messages: [fixMisplacedToolCalls(response)] }
}

async function toolsNode(state: typeof TushareState.State) {
  const { toolNode } = await getTushareToolset()
  // ToolNode 透传工具内 interrupt(GraphInterrupt)，图暂停 + checkpoint
  return toolNode.invoke(state)
}

function shouldContinue(state: typeof TushareState.State): 'tools' | '__end__' {
  const lastMessage = state.messages.at(-1)
  if (lastMessage && AIMessage.isInstance(lastMessage) && lastMessage.tool_calls?.length)
    return 'tools'
  return '__end__'
}

export const tushareGraph = new StateGraph(TushareState)
  .addNode('agent', agent)
  .addNode('tools', toolsNode)
  .addEdge('__start__', 'agent')
  .addConditionalEdges('agent', shouldContinue)
  .addEdge('tools', 'agent')
