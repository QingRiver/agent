import type { GraphsName } from '@agent/graph'
import type { Context } from 'hono'
import type { GraphStateQuery, GraphStreamRequest } from '../../shared/graphStream'
import type { AppEnv } from '../types'
import { streamSSE } from 'hono/streaming'
import { getGraphApp, resolveGraphInput, resolveGraphRunOptions } from '../agent/graphAgents'
import {
  projectLangGraphChunk,
  readSnapshotInterrupts,
  readSnapshotMessages,
} from '../agent/langgraphWire'
import { assertThreadOwnedByUser } from '../conversation/threadGuard'
import { getThreadSnapshot } from '../conversation/threadState'

/**
 * LangGraph `messages` + `updates` + `custom` SSE，供 assistant-ui 直接消费。
 */
export class GraphStreamHandlers {
  static async stream(
    c: Context<AppEnv>,
    user: { id: string },
    name: GraphsName,
    body: GraphStreamRequest,
  ) {
    if (!(await assertThreadOwnedByUser(user.id, body.threadId)))
      return c.json({ error: 'Forbidden: thread not owned by user' }, 403)

    const input = resolveGraphInput(name, {
      messages: body.messages,
      ...(body.command ? { command: body.command } : {}),
      ...(body.configurable ? { configurable: body.configurable } : {}),
    })
    const run = await resolveGraphRunOptions(name, user.id, body.configurable)
    const graph = getGraphApp(name)

    // streamSSE 会带上 transfer-encoding / connection。HTTP/2 禁止这两种头，
    // 写出去会把 Node 进程打崩。删掉后 h2 和 h1 都能把 SSE 流出去。
    const response = streamSSE(c, async (stream) => {
      try {
        const chunks = await graph.stream(input, {
          streamMode: ['messages', 'updates', 'custom'],
          configurable: { thread_id: body.threadId, ...run.configurable },
          ...(run.recursionLimit != null ? { recursionLimit: run.recursionLimit } : {}),
        })
        for await (const chunk of chunks) {
          for (const event of projectLangGraphChunk(chunk))
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
    response.headers.delete('transfer-encoding')
    response.headers.delete('connection')
    return response
  }

  static async state(
    c: Context<AppEnv>,
    user: { id: string },
    name: GraphsName,
    query: GraphStateQuery,
  ) {
    if (!(await assertThreadOwnedByUser(user.id, query.threadId)))
      return c.json({ error: 'Forbidden: thread not owned by user' }, 403)

    const snapshot = await getThreadSnapshot(name, query.threadId)
    const values = (snapshot.values ?? {}) as { messages?: unknown }
    return c.json({
      messages: readSnapshotMessages(values),
      interrupts: readSnapshotInterrupts(snapshot),
    })
  }
}
