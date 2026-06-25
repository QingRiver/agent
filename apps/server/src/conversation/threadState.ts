import type { GraphsName } from '@agent/graph'
import type { CompiledStateGraph, StateSnapshot } from '@langchain/langgraph'
import type { PendingInterrupt } from '../../shared/conversation'
import { PendingInterruptSchema } from '../../shared/conversation'
import { getAguiGraphApp } from '../agent'

interface CheckpointTask {
  interrupts?: Array<{
    id?: string
    value?: unknown
  }>
}

export async function getThreadSnapshot(
  graphsName: GraphsName,
  threadId: string,
): Promise<StateSnapshot> {
  const app = getAguiGraphApp(graphsName) as unknown as CompiledStateGraph<unknown, unknown>
  return app.getState({ configurable: { thread_id: threadId } })
}

/** checkpoints.sqlite 为唯一真相源：从 LangGraph snapshot hydrate 挂起的 HITL interrupt */
export function extractPendingInterruptFromSnapshot(
  snapshot: StateSnapshot,
): PendingInterrupt | null {
  const tasks = (snapshot as { tasks?: CheckpointTask[] }).tasks ?? []

  for (const task of tasks) {
    for (const interrupt of task.interrupts ?? []) {
      const value = interrupt.value
      if (value == null || typeof value !== 'object')
        continue
      const v = value as Record<string, unknown>
      const interruptId = interrupt.id
      if (!interruptId || typeof v.type !== 'string')
        continue
      const parsed = PendingInterruptSchema.safeParse({ interruptId, ...v })
      if (parsed.success)
        return parsed.data
    }
  }

  return null
}
