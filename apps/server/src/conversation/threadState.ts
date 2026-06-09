import type { CompiledStateGraph, StateSnapshot } from '@langchain/langgraph'
import type { AgentId, PendingInterrupt } from '../../shared/conversation'
import type { AguiGraphName } from '../graphs/graphAppFactory'
import { PendingInterruptSchema } from '../../shared/conversation'
import { getAguiGraphApp } from '../graphs/graphAppFactory'

interface CheckpointTask {
  interrupts?: Array<{
    id?: string
    value?: unknown
  }>
}

export async function getThreadSnapshot(
  agentId: AgentId,
  threadId: string,
): Promise<StateSnapshot> {
  const graphName = agentIdToGraphName(agentId)
  if (!graphName)
    throw new Error(`Unknown agent for checkpoint hydrate: ${agentId}`)

  const app = getAguiGraphApp(graphName, 'auth') as unknown as CompiledStateGraph<unknown, unknown>
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
      const parsed = PendingInterruptSchema.safeParse({
        interruptId: interrupt.id,
        type: v.type,
        message: v.message,
        details: v.details,
      })
      if (parsed.success)
        return parsed.data
    }
  }

  return null
}

function agentIdToGraphName(agentId: AgentId): AguiGraphName | null {
  switch (agentId) {
    case 'hitl':
      return 'hitl'
    case 'simple':
      return 'simple'
    case 'simpleToolCall':
      return 'simpleToolCall'
    case 'weather':
      return 'weather'
    case 'obsidian':
      return 'obsidian'
    default:
      return null
  }
}
