import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { ASK_TOOLS } from './ask-tools'

export const FETCH_USER_ORDER_TOOL_NAME = 'fetch_user_order'

export const ORDER_TOOL_PROGRESS_EVENT = 'order_tool_progress'

export const fetchUserOrderTool = tool(
  async ({ orderId }, config) => {
    const writer = (config as LangGraphRunnableConfig | undefined)?.writer
    writer?.({
      name: ORDER_TOOL_PROGRESS_EVENT,
      payload: { orderId, step: 'dispatch' },
    })
    return `订单 ${orderId} 已取消（模拟工具结果）`
  },
  {
    name: FETCH_USER_ORDER_TOOL_NAME,
    description: '根据订单号查询并处理用户订单（测试用模拟工具）。',
    schema: z.object({
      orderId: z.string().describe('订单号'),
    }),
  },
)

export const ORDER_TOOLS = [fetchUserOrderTool, ...ASK_TOOLS]
