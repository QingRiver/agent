import { randomUUID } from 'node:crypto'
import { MemorySaver } from '@langchain/langgraph'

/** 开发环境进程内 checkpointer，供 CopilotKit threadId / getState 使用 */
export const devMemoryCheckpointer = new MemorySaver()

/** 带 checkpointer 的图调用必须提供 thread_id */
export function devThreadConfig(threadId = randomUUID()) {
  return { configurable: { thread_id: threadId } }
}
