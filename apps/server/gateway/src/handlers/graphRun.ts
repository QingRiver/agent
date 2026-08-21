import type { RunAgentInput } from '@ag-ui/core'
import type { GraphsName } from '@agent/graph'
import type { Context } from 'hono'
import type { GraphRunRequest } from '../../shared/graphRun'
import type { AppEnv } from '../types'
import { streamSSE } from 'hono/streaming'
import { getAguiGraphApp, getGraphAgentStreamOptions } from '../agent/graphAgents'
import { streamGraphAguiEvents } from '../agent/streamGraphAguiEvents'
import { assertThreadOwnedByUser } from '../conversation/threadGuard'

/**
 * 薄 AG-UI SSE：旁路 CopilotKit Runtime，直接 drain streamGraphAguiEvents。
 * 协议仍是 AG-UI BaseEvent（text/event-stream），与具体图无关。
 */
export class GraphRunHandlers {
  static async run(
    c: Context<AppEnv>,
    user: { id: string },
    name: GraphsName,
    body: GraphRunRequest,
  ) {
    if (!(await assertThreadOwnedByUser(user.id, body.threadId)))
      return c.json({ error: 'Forbidden: thread not owned by user' }, 403)

    const input: RunAgentInput = {
      threadId: body.threadId,
      runId: body.runId ?? crypto.randomUUID(),
      state: body.state,
      messages: body.messages as RunAgentInput['messages'],
      tools: [],
      context: [],
      forwardedProps: body.forwardedProps ?? {},
    }

    return streamSSE(c, async (stream) => {
      try {
        for await (const ev of streamGraphAguiEvents(
          input,
          getAguiGraphApp(name),
          getGraphAgentStreamOptions(name),
          name,
        )) {
          await stream.writeSSE({ data: JSON.stringify(ev) })
        }
      }
      catch (err) {
        console.error(`[graphs/${name}/run]`, err)
        await stream.writeSSE({
          data: JSON.stringify({
            type: 'RUN_ERROR',
            message: err instanceof Error ? err.message : String(err),
            code: 'GRAPH_SSE',
            name: err instanceof Error ? err.name : 'Error',
          }),
        })
      }
    })
  }
}
