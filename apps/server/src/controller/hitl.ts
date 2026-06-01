import type { Context } from 'koa'
import { randomUUID } from 'node:crypto'
import { Command } from '@langchain/langgraph'
import {
  getInterruptPayload,
  hitlGraphApp,
  hitlThreadConfig,
} from '../graphs/hitlGraph'
import { Controller, Get, Post } from '../router/decorator'
import { createSseStream, sseEvent } from '../utils/sse'

interface ApprovalBody {
  approved: boolean
  reason?: string
}

function setSseHeaders(ctx: Context): void {
  ctx.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  ctx.status = 200
}

@Controller('/hitl')
export class HitlController {
  @Get('/workflow/sse')
  async workflowStartSse(ctx: Context) {
    const input = typeof ctx.query.input === 'string' && ctx.query.input
      ? ctx.query.input
      : '向账户 0x123... 转账 100 ETH'

    const threadId = randomUUID()
    const config = hitlThreadConfig(threadId)

    async function* events() {
      yield sseEvent({ type: 'start', phase: 'run_until_approval', threadId })

      let step = 0
      const stream = await hitlGraphApp.stream(
        { input },
        { ...config, streamMode: 'updates' },
      )

      for await (const update of stream) {
        step += 1
        yield sseEvent({ type: 'step', step, data: update })
      }

      const snapshot = await hitlGraphApp.getState(config)
      const interruptPayload = getInterruptPayload(snapshot)

      if (interruptPayload) {
        yield sseEvent({
          type: 'waiting',
          threadId,
          sessionId: threadId,
          data: interruptPayload.data,
        })
      }

      yield sseEvent({ type: 'phase_done', phase: 'run_until_approval' })
      yield 'data: [DONE]\n\n'
    }

    setSseHeaders(ctx)
    ctx.body = createSseStream(events())
  }

  @Post('/workflow/:threadId/resume')
  async workflowResumeSse(ctx: Context) {
    const threadId = ctx.params.threadId as string
    const body = ctx.request.body as ApprovalBody | undefined

    if (!body || typeof body.approved !== 'boolean') {
      ctx.status = 400
      ctx.body = { error: 'body.approved (boolean) is required' }
      return
    }

    const config = hitlThreadConfig(threadId)
    const snapshot = await hitlGraphApp.getState(config)
    if (!getInterruptPayload(snapshot)) {
      ctx.status = 404
      ctx.body = { error: 'thread not found or not waiting for approval' }
      return
    }

    const approval = body

    async function* events() {
      yield sseEvent({ type: 'start', phase: 'resume', threadId })

      try {
        let step = 2
        const stream = await hitlGraphApp.stream(
          new Command({
            resume: {
              approved: approval.approved,
              reason: approval.reason,
            },
          }),
          { ...config, streamMode: 'updates' },
        )

        for await (const update of stream) {
          step += 1
          yield sseEvent({ type: 'step', step, data: update })
        }

        const finalSnapshot = await hitlGraphApp.getState(config)
        if (finalSnapshot.values?.result) {
          yield sseEvent({ type: 'final', data: finalSnapshot.values.result })
        }
      }
      catch (err) {
        yield sseEvent({
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
        })
      }

      yield sseEvent({ type: 'phase_done', phase: 'resume' })
      yield 'data: [DONE]\n\n'
    }

    setSseHeaders(ctx)
    ctx.body = createSseStream(events())
  }
}
