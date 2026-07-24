import type { DevStateType } from '../state/devState'
import process from 'node:process'
import { SystemMessage } from '@langchain/core/messages'
import { END, START, StateGraph } from '@langchain/langgraph'
import { ToolNode } from '@langchain/langgraph/prebuilt'
import { ChatOpenAI } from '@langchain/openai'
import { routeByDevIntent } from '../edges/routeByDevIntent'
import { shouldContinue } from '../edges/shouldContinue'
import { clarifyDevIntent } from '../nodes/clarifyDevIntent'
import { collectHitlDemo } from '../nodes/collectHitlDemo'
import { executeHitlDemo } from '../nodes/executeHitlDemo'
import { DevState } from '../state/devState'
import { ASK_SYSTEM_PROMPT } from '../tools/ask-tools'
import { ORDER_TOOLS } from '../tools/order'
import { WEATHER_TOOLS } from '../tools/weather'

const WEATHER_SYSTEM_PROMPT = [
  '你是天气助手。查天气只能通过 get_weather，禁止编造气温或天气。',
  '对话节奏：',
  '1. 用户尚未提出查天气需求时（例如刚选能力、只说「你好」「开始演示」等）：只回一段简短开场白，邀请用户说明想查哪个城市的天气；本轮不要调用任何工具，等待用户下一句。',
  '2. 用户已明确要查天气、但未给出城市/地区：必须调用 ask_input（message 问城市，placeholder 如「北京」），禁止在正文里用自然语言追问。调用 ask_input 时本轮不要写解释性正文。',
  '3. 城市已明确：直接 get_weather；拿到工具结果后再用一两句话总结。',
  '4. 不要臆测默认城市。',
].join('\n')

const ORDER_SYSTEM_PROMPT = [
  '你是订单助手。取消/查询订单只能通过 fetch_user_order。',
  '硬性规则：',
  '1. 用户未给出订单号时，必须立刻调用 ask_input 索取订单号，禁止在正文里用自然语言追问。',
  '2. 未拿到工具结果前不要输出普通助手回复（可为空 content，只发 tool_calls）。',
  '3. 订单号已明确时直接 fetch_user_order，再简短总结结果。',
].join('\n')

const llm = new ChatOpenAI({
  model: process.env.OPENAI_MODEL ?? '',
  temperature: 0,
})

const weatherLlm = llm.bindTools(WEATHER_TOOLS)
const orderLlm = llm.bindTools(ORDER_TOOLS)

async function agentWeather(state: DevStateType) {
  const system = `${WEATHER_SYSTEM_PROMPT}\n\n${ASK_SYSTEM_PROMPT}`
  const messages = state.messages[0]?.type === 'system'
    ? state.messages
    : [new SystemMessage(system), ...state.messages]
  const response = await weatherLlm.invoke(messages)
  return { messages: [response] }
}

async function agentOrder(state: DevStateType) {
  const system = `${ORDER_SYSTEM_PROMPT}\n\n${ASK_SYSTEM_PROMPT}`
  const messages = state.messages[0]?.type === 'system'
    ? state.messages
    : [new SystemMessage(system), ...state.messages]
  const response = await orderLlm.invoke(messages)
  return { messages: [response] }
}

function weatherContinue(state: DevStateType): 'tools_weather' | typeof END {
  return shouldContinue(state) === 'tools' ? 'tools_weather' : END
}

function orderContinue(state: DevStateType): 'tools_order' | typeof END {
  return shouldContinue(state) === 'tools' ? 'tools_order' : END
}

export const devGraph = new StateGraph(DevState)
  .addNode('clarify', clarifyDevIntent)
  .addNode('agent_weather', agentWeather)
  .addNode('tools_weather', new ToolNode(WEATHER_TOOLS))
  .addNode('agent_order', agentOrder)
  .addNode('tools_order', new ToolNode(ORDER_TOOLS))
  .addNode('collect_hitl', collectHitlDemo)
  .addNode('execute_hitl', executeHitlDemo)
  .addEdge(START, 'clarify')
  .addConditionalEdges('clarify', routeByDevIntent, {
    agent_weather: 'agent_weather',
    agent_order: 'agent_order',
    collect_hitl: 'collect_hitl',
  })
  .addConditionalEdges('agent_weather', weatherContinue, {
    tools_weather: 'tools_weather',
    [END]: END,
  })
  .addEdge('tools_weather', 'agent_weather')
  .addConditionalEdges('agent_order', orderContinue, {
    tools_order: 'tools_order',
    [END]: END,
  })
  .addEdge('tools_order', 'agent_order')
  .addEdge('collect_hitl', 'execute_hitl')
  .addEdge('execute_hitl', END)
