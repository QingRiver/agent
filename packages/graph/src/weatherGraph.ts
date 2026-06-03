import type { BaseMessage } from '@langchain/core/messages'
import process from 'node:process'
import { openMeteo } from '@agent/tools'
import { AIMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { Annotation, StateGraph } from '@langchain/langgraph'
import { ToolNode } from '@langchain/langgraph/prebuilt'
import { ChatOpenAI } from '@langchain/openai'
import { z } from 'zod'

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

const tools = [getWeatherTool]

const llm = new ChatOpenAI({
  model: process.env.OPENAI_MODEL ?? '',
  temperature: 0,
})

const llmWithTools = llm.bindTools(tools)

async function chatbot(state: typeof WeatherState.State) {
  const response = await llmWithTools.invoke(state.messages)
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
