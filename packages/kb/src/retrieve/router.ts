import { z } from 'zod'
import { chatCompletionJson } from '../utils/chatCompletion'

const RouteSchema = z.object({
  isKbQuery: z.boolean(),
  reason: z.string(),
})

export interface RouteDecision {
  isKbQuery: boolean
  reason: string
}

export async function routeIntent(userQuery: string): Promise<RouteDecision> {
  return chatCompletionJson({
    system: [
      '判断用户消息是否应走知识库检索。',
      '知识库：询问文档、政策、流程、产品说明、内部资料等。',
      '非知识库：闲聊、写代码、天气、与资料无关的通用对话。',
      '仅输出 JSON：{"isKbQuery":true|false,"reason":"简短说明"}',
    ].join('\n'),
    user: userQuery,
    schema: RouteSchema,
    fallback: { isKbQuery: true, reason: '默认走知识库检索' },
  })
}
