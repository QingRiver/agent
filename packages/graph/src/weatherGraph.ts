import type { BaseMessage } from '@langchain/core/messages'
import process from 'node:process'
import { openMeteo } from '@agent/tools'
import { AIMessage, SystemMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { Annotation, StateGraph } from '@langchain/langgraph'
import { ToolNode } from '@langchain/langgraph/prebuilt'
import { ChatOpenAI } from '@langchain/openai'
import { z } from 'zod'
import { ASK_SYSTEM_PROMPT, ASK_TOOLS } from './hitl/ask-tools'

const WeatherState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
})

const getWeatherTool = tool(
  async ({ location }) => {
    try {
      return await openMeteo.fetchWeatherByCity(location)
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return `查询「${location}」天气失败：${message}`
    }
  },
  {
    name: 'get_weather',
    description: '根据城市名称查询当前真实天气（Open-Meteo 地理编码 + 预报）。',
    schema: z.object({
      location: z.string().describe('城市名称，如：北京、上海、Tokyo'),
    }),
  },
)

const tools = [getWeatherTool, ...ASK_TOOLS]

const llm = new ChatOpenAI({
  model: process.env.OPENAI_MODEL ?? '',
  temperature: 0,
})

const llmWithTools = llm.bindTools(tools)

async function chatbot(state: typeof WeatherState.State) {
  // 首轮注入 system prompt:引导 AI 缺信息时调 ask_* 而非臆测(与 CLI interact-tools 同构)
  const messages = state.messages[0]?.getType() === 'system'
    ? state.messages
    : [new SystemMessage(ASK_SYSTEM_PROMPT), ...state.messages]
  const response = await llmWithTools.invoke(messages)
  return { messages: [response] }
}

function shouldContinue(state: typeof WeatherState.State): 'tools' | '__end__' {
  const lastMessage = state.messages.at(-1)
  if (lastMessage && AIMessage.isInstance(lastMessage) && lastMessage.tool_calls?.length)
    return 'tools'
  return '__end__'
}

export const weatherGraph = new StateGraph(WeatherState)
  .addNode('agent', chatbot)
  .addNode('tools', new ToolNode(tools))
  .addEdge('__start__', 'agent')
  .addConditionalEdges('agent', shouldContinue)
  .addEdge('tools', 'agent')
