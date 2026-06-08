import type { ObsidianSearchResult } from '@agent/tools'
import type { BaseMessage } from '@langchain/core/messages'
import process from 'node:process'
import { obsidian } from '@agent/tools'
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { Annotation, StateGraph } from '@langchain/langgraph'
import { ToolNode } from '@langchain/langgraph/prebuilt'
import { ChatOpenAI } from '@langchain/openai'
import { z } from 'zod'
import { getAIMessageContent } from './utils'

export const OBSIDIAN_SEARCH_TOOL_NAME = 'obsidian_search'
export const MAX_SEARCH_RESULTS = 5

const SYSTEM_PROMPT = [
  '你是 Obsidian 知识库助手。需要检索时调用 obsidian_search 工具。',
  '',
  'Obsidian 搜索不支持模糊匹配，search_keywords 必须严格遵守：',
  '- 只从用户原话中提取名词、术语、实体等检索关键词',
  '- 禁止添加同义词、相关词、上位词或自行拓展',
  '- 禁止把整句问法、动词、助词塞进 search_keywords',
  '- 若用户只给一个词，就原样使用这个词',
  '',
  '拿到工具返回后，结合检索结果回答用户。',
].join('\n')

const mainLlm = new ChatOpenAI({
  model: process.env.OPENAI_MODEL ?? '',
  temperature: 0,
})

const miniLlm = new ChatOpenAI({
  model: process.env.OPENAI_MODEL_MINI ?? process.env.OPENAI_MODEL ?? '',
  temperature: 0,
})

const ObsidianState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
})

function formatExcerpt(excerpt: string): string {
  return excerpt.replaceAll('<br>', '\n').trim()
}

function buildRewritePrompt(input: {
  userQuestion: string
  searchKeywords: string
  documents: ObsidianSearchResult[]
}): string {
  const blocks = input.documents.map((doc, index) => [
    `### 文档 ${index + 1}：${doc.basename}`,
    `路径：${doc.path}`,
    '',
    '片段（非全文）：',
    formatExcerpt(doc.excerpt),
  ].join('\n'))

  return [
    '你是知识库信息抽取助手。从下方 Obsidian 笔记片段中，提取能回答用户问题的核心事实、代码片段或核心实体。',
    '请提取出该文档中能够回答用户问题的核心事实、代码片段或核心实体。严格剔除所有寒暄、背景介绍和与问题无关的段落，以极简的 Markdown 列表返回。',
    '',
    `检索关键词：${input.searchKeywords}`,
    `用户问题：${input.userQuestion}`,
    '',
    ...blocks,
  ].join('\n')
}

async function searchAndRewrite(searchKeywords: string, userQuestion: string): Promise<string> {
  const results = (await obsidian.searchNotes(searchKeywords)).slice(0, MAX_SEARCH_RESULTS)
  if (!results.length)
    return `Obsidian 未找到与「${searchKeywords}」相关的笔记。`

  const response = await miniLlm.invoke([
    new HumanMessage(buildRewritePrompt({
      searchKeywords,
      userQuestion,
      documents: results,
    })),
  ])

  return getAIMessageContent(response).trim()
}

const obsidianSearchTool = tool(
  async ({ search_keywords, user_question }) => searchAndRewrite(search_keywords, user_question),
  {
    name: OBSIDIAN_SEARCH_TOOL_NAME,
    description: '在 Obsidian 知识库中检索笔记。search_keywords 用于全文检索（不支持模糊匹配），user_question 用于信息抽取。',
    schema: z.object({
      search_keywords: z.string().describe(
        '从用户原话提取的检索关键词，严禁添加同义词或自行拓展。',
      ),
      user_question: z.string().describe('用户完整问题，用于信息抽取'),
    }),
  },
)

const tools = [obsidianSearchTool]
const llmWithTools = mainLlm.bindTools(tools)

function withSystemPrompt(messages: BaseMessage[]): BaseMessage[] {
  if (messages.some(m => m.type === 'system'))
    return messages
  return [new SystemMessage(SYSTEM_PROMPT), ...messages]
}

async function agent(state: typeof ObsidianState.State) {
  const response = await llmWithTools.invoke(withSystemPrompt(state.messages))
  return { messages: [response] }
}

function shouldContinue(state: typeof ObsidianState.State): 'tools' | '__end__' {
  const lastMessage = state.messages.at(-1)
  if (lastMessage && AIMessage.isInstance(lastMessage) && lastMessage.tool_calls?.length)
    return 'tools'
  return '__end__'
}

export const obsidianGraph = new StateGraph(ObsidianState)
  .addNode('agent', agent)
  .addNode('tools', new ToolNode(tools))
  .addEdge('__start__', 'agent')
  .addConditionalEdges('agent', shouldContinue)
  .addEdge('tools', 'agent')
