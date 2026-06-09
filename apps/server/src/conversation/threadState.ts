import type { CompiledStateGraph } from '@langchain/langgraph'
import type { AgentId, PendingInterrupt, ThreadState } from '../../shared/conversation'
import type { AguiGraphName } from '../graphs/graphAppFactory'
import { PendingInterruptSchema } from '../../shared/conversation'
import { getAguiGraphApp } from '../graphs/graphAppFactory'

interface CheckpointTask {
  interrupts?: Array<{
    id?: string
    value?: unknown
  }>
}

/**
 * 从 LangGraph checkpointer hydrate 执行态（单一真相源）。
 * app.sqlite 的 messages 仅是 UI 读模型投影，不承载 interrupt / 图位置。
 */
export async function hydrateThreadState(
  agentId: AgentId,
  threadId: string,
): Promise<ThreadState> {
  const pendingInterrupt = await readPendingInterrupt(agentId, threadId)
  return { pendingInterrupt }
}

async function readPendingInterrupt(
  agentId: AgentId,
  threadId: string,
): Promise<PendingInterrupt | null> {
  const graphName = agentIdToGraphName(agentId)
  if (!graphName)
    return null

  const app = getAguiGraphApp(graphName, 'auth') as unknown as CompiledStateGraph<unknown, unknown>
  const snapshot = await app.getState({ configurable: { thread_id: threadId } })
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
