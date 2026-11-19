import type { GraphsName } from '@agent/graph'
import type { StateSnapshot } from '@langchain/langgraph'
import { getGraphApp } from '../agent'

export async function getThreadSnapshot(
  graphsName: GraphsName,
  threadId: string,
): Promise<StateSnapshot> {
  const app = getGraphApp(graphsName)
  return app.getState({ configurable: { thread_id: threadId } })
}
