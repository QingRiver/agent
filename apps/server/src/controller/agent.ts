import type { BaseEvent, RunAgentInput } from '@ag-ui/core'
import type { Context } from 'hono'
import type { Observable } from 'rxjs'
import type { AppEnv } from '../types'
import { getAgent } from '../agent'
import { Controller, Post } from '../router/decorator'

const SSE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  'X-Accel-Buffering': 'no',
}

function respondWithAguiStream(c: Context, eventStream$: Observable<BaseEvent>) {
  const encoder = new TextEncoder()

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const subscription = eventStream$.subscribe({
        next: (event) => {
          const frame = `event: agent_event\ndata: ${JSON.stringify(event)}\n\n`
          controller.enqueue(encoder.encode(frame))
        },
        error: (err) => {
          console.error('[SSE Stream Error]:', err)
          controller.close()
        },
        complete: () => {
          controller.close()
        },
      })

      const onAbort = () => {
        subscription.unsubscribe()
        try {
          controller.close()
        }
        catch {
          // already closed
        }
      }

      c.req.raw.signal.addEventListener('abort', onAbort, { once: true })
    },
  })

  return c.newResponse(body, { status: 200, headers: SSE_HEADERS })
}

@Controller('/api/agent')
export class AgentController {
  @Post('/:agentId/run')
  async run(c: Context<AppEnv>): Promise<Response> {
    const agentId = c.req.param('agentId') ?? ''
    if (!agentId)
      return c.json({ error: 'Missing agentId' }, 400)

    const agent = getAgent(agentId)
    if (!agent)
      return c.json({ error: `Unknown agent: ${agentId}` }, 404)

    const body = await c.req.json() as RunAgentInput
    if (!body.threadId || !body.runId)
      return c.json({ error: 'Missing threadId or runId' }, 400)

    return respondWithAguiStream(c, agent.clone().run(body))
  }
}
