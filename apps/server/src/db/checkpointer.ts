import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint'
import { randomUUID } from 'node:crypto'
import { MemorySaver } from '@langchain/langgraph'
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite'
import { checkpointDbPath } from './sqlite'

export type CheckpointerMode = 'guest' | 'auth'

const guestCheckpointer = new MemorySaver()
const authCheckpointer = SqliteSaver.fromConnString(checkpointDbPath())

export function getGuestCheckpointer(): MemorySaver {
  return guestCheckpointer
}

export function getAuthCheckpointer(): SqliteSaver {
  return authCheckpointer
}

export function getCheckpointer(mode: CheckpointerMode): BaseCheckpointSaver {
  return mode === 'auth' ? authCheckpointer : guestCheckpointer
}

/** 带 checkpointer 的图调用必须提供 thread_id */
export function devThreadConfig(threadId = randomUUID()) {
  return { configurable: { thread_id: threadId } }
}
