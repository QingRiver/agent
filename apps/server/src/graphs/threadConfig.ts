import { randomUUID } from 'node:crypto'

/** 带 checkpointer 的图调用必须提供 thread_id */
export function devThreadConfig(threadId = randomUUID()) {
  return { configurable: { thread_id: threadId } }
}
