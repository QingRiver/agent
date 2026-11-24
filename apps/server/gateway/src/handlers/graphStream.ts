import type { GraphsName } from '@agent/graph'
import type { Context } from 'hono'
import type { GraphStateQuery, GraphStreamRequest } from '../../shared/graphStream'
import type { AppEnv } from '../types'
import { getGraphApp, resolveGraphInput, resolveGraphRunOptions } from '../agent/graphAgents'
import { iterateGraphWireEvents } from '../agent/iterateGraphWire'
import {
  readSnapshotInterrupts,
  readSnapshotMessages,
} from '../agent/langgraphWire'
import { requireThreadOwned } from '../conversation/threadGuard'
import { getThreadSnapshot } from '../conversation/threadState'
import { createGraphSseResponse } from '../http/graphSse'
import { ConversationService } from '../service/conversation'

/** LangGraph `messages` + `updates` + `custom` SSE，供 assistant-ui 直接消费。 */
export async function streamGraph(
  c: Context<AppEnv>,
  user: { id: string },
  name: GraphsName,
  body: GraphStreamRequest,
) {
  await requireThreadOwned(user.id, body.threadId)
  await ConversationService.touch(user.id, body.threadId)

  const input = resolveGraphInput(name, {
    messages: body.messages,
    ...(body.command ? { command: body.command } : {}),
    ...(body.configurable ? { configurable: body.configurable } : {}),
  })
  const run = await resolveGraphRunOptions(name, user.id, body.configurable)
  const graph = getGraphApp(name)

  return createGraphSseResponse(c, async (stream) => {
    try {
      for await (const event of iterateGraphWireEvents(graph, input, {
        signal: c.req.raw.signal,
        configurable: { thread_id: body.threadId, ...run.configurable },
        ...(run.recursionLimit != null ? { recursionLimit: run.recursionLimit } : {}),
      })) {
        await stream.writeSSE({ data: JSON.stringify(event) })
      }
    }
    catch (err) {
      console.error(`[graphs/${name}/stream]`, err)
      await stream.writeSSE({
        data: JSON.stringify({
          event: 'error',
          data: { message: err instanceof Error ? err.message : String(err) },
        }),
      })
    }
  })
}

export async function graphState(
  c: Context<AppEnv>,
  user: { id: string },
  name: GraphsName,
  query: GraphStateQuery,
) {
  await requireThreadOwned(user.id, query.threadId)

  const snapshot = await getThreadSnapshot(name, query.threadId)
  const values = (snapshot.values ?? {}) as { messages?: unknown }
  return c.json({
    messages: readSnapshotMessages(values),
    interrupts: readSnapshotInterrupts(snapshot),
  })
}
