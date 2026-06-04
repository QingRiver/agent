import type { BaseMessage } from '@langchain/core/messages'
import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import { AIMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { Annotation, StateGraph } from '@langchain/langgraph'
import { ToolNode } from '@langchain/langgraph/prebuilt'
import { z } from 'zod'
import { llmLog } from './utils'

const ToolCallState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
})

export const FETCH_USER_ORDER_TOOL_NAME = 'fetch_user_order'

export const ORDER_TOOL_PROGRESS_EVENT = 'order_tool_progress'

const fetchUserOrderTool = tool(
  async ({ orderId }) => `订单 ${orderId} 已取消（模拟工具结果）`,
  {
    name: FETCH_USER_ORDER_TOOL_NAME,
    description: '根据订单号查询并处理用户订单（测试用模拟工具）。',
    schema: z.object({
      orderId: z.string().describe('订单号'),
    }),
  },
)

const tools = [fetchUserOrderTool]

async function agent(
  state: typeof ToolCallState.State,
  config: LangGraphRunnableConfig,
) {
  const hasToolResult = state.messages.some(m => m.type === 'tool')
  if (!hasToolResult) {
    config.writer?.({
      name: ORDER_TOOL_PROGRESS_EVENT,
      payload: { orderId: '10086', step: 'dispatch' },
    })
    return {
      messages: [
        new AIMessage({
          content: '正在调用取消订单工具',
          tool_calls: [
            {
              id: 'call_mock_9527',
              name: FETCH_USER_ORDER_TOOL_NAME,
              args: { orderId: '10086' },
            },
          ],
        }),
      ],
    }
  }

  const response = await llmLog('收到，您的订单已取消！')
  return { messages: [response] }
}

function shouldContinue(state: typeof ToolCallState.State): 'tools' | '__end__' {
  const lastMessage = state.messages.at(-1)
  if (lastMessage && AIMessage.isInstance(lastMessage) && lastMessage.tool_calls?.length)
    return 'tools'
  return '__end__'
}

export const simpleToolCallGraph = new StateGraph(ToolCallState)
  .addNode('agent', agent)
  .addNode('tools', new ToolNode(tools))
  .addEdge('__start__', 'agent')
  .addConditionalEdges('agent', shouldContinue)
  .addEdge('tools', 'agent')
