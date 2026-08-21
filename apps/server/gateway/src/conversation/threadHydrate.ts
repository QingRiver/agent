import type { GraphsName } from '@agent/graph'
import type { AgUiMessage, ThreadState } from '../../shared/conversation'
import { extractPendingInterruptFromSnapshot, getThreadSnapshot } from './threadState'
import { mapStateToAgUiMessages } from './toAgUiMessages'

export interface ThreadBundle {
  messages: AgUiMessage[]
  threadState: ThreadState
}

export async function hydrateThreadBundle(
  graphsName: GraphsName,
  threadId: string,
): Promise<ThreadBundle> {
  const snapshot = await getThreadSnapshot(graphsName, threadId)
  const values = (snapshot.values ?? {}) as Record<string, unknown>

  return {
    messages: mapStateToAgUiMessages(graphsName, values),
    threadState: {
      pendingInterrupt: extractPendingInterruptFromSnapshot(snapshot),
    },
  }
}
