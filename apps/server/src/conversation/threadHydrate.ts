import type { AgentId, AgUiMessage, ThreadState } from '../../shared/conversation'
import { mapStateToAgUiMessages } from './mapStateToAgUiMessages'
import { extractPendingInterruptFromSnapshot, getThreadSnapshot } from './threadState'

export interface ThreadBundle {
  messages: AgUiMessage[]
  threadState: ThreadState
}

export async function hydrateThreadBundle(
  agentId: AgentId,
  threadId: string,
): Promise<ThreadBundle> {
  const snapshot = await getThreadSnapshot(agentId, threadId)
  const values = (snapshot.values ?? {}) as Record<string, unknown>

  return {
    messages: mapStateToAgUiMessages(agentId, values),
    threadState: {
      pendingInterrupt: extractPendingInterruptFromSnapshot(snapshot),
    },
  }
}
