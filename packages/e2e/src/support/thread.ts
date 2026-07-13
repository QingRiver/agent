import { e2eFetch } from '../client'
import { fail } from './assert'

/**
 * 创建会话线程。所有 agent SSE flow 共享的 bootstrap：先建 thread，再用 threadId 跑 agent。
 * 参数：token（signInE2E 取得）、agentId（server GraphsName）。返回新建 thread id。
 */
export async function createThread(token: string, agentId: string): Promise<string> {
  const data = await e2eFetch<{ conversation: { id: string } }>(
    token,
    '/conversations/create',
    { method: 'POST', body: JSON.stringify({ agentId }) },
  )
  const id = data.conversation?.id
  if (!id)
    fail('建会话响应缺少 conversation.id')
  return id
}
