import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint'
import { MemorySaver } from '@langchain/langgraph'
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite'
import { checkpointDbPath } from '../db/sqlite'

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
