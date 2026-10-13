import type { GraphsName } from '@agent/graph'
import type { CompiledStateGraph, StateSnapshot } from '@langchain/langgraph'
import { getGraphApp } from '../agent'

export async function getThreadSnapshot(
  graphsName: GraphsName,
  threadId: string,
): Promise<StateSnapshot> {
  const app = getGraphApp(graphsName) as unknown as CompiledStateGraph<unknown, unknown>
  return app.getState({ configurable: { thread_id: threadId } })
}
