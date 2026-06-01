import type { Context } from 'koa'
import { randomUUID } from 'node:crypto'
import { Command } from '@langchain/langgraph'
import { z } from 'zod'
import {
  getInterruptPayload,
  hitlGraphApp,
  hitlThreadConfig,
} from '../graphs/hitlGraph'
import { Controller, Get, Post } from '../router/decorator'

@Controller('/hitl')
export class HitlController {
  static readonly #approvalBodySchema = z.object({
    approved: z.boolean(),
    reason: z.string().optional(),
  })

  static readonly #threadIdParamSchema = z.uuid()

  @Get('/workflow/sse')
  async workflowStartSse(ctx: Context) {
    const input = typeof ctx.query.input === 'string' && ctx.query.input
      ? ctx.query.input
      : '向账户 0x123... 转账 100 ETH'

    const threadId = randomUUID()
    const config = hitlThreadConfig(threadId)

    async function* events() {
      yield { type: 'thread', threadId }

      const stream = await hitlGraphApp.stream(
        { input },
        { ...config, streamMode: 'updates' },
      )

      for await (const update of stream)
        yield update

      const snapshot = await hitlGraphApp.getState(config)
      const interruptPayload = getInterruptPayload(snapshot)

      if (interruptPayload) {
        yield {
          type: 'waiting',
          data: interruptPayload.data,
        }
      }
    }

    ctx.body = events()
  }

  @Post('/workflow/:threadId/resume')
  async workflowResumeSse(ctx: Context) {
    async function* events() {
      const threadId = HitlController.#threadIdParamSchema.parse(ctx.params.threadId)
      const approval = HitlController.#approvalBodySchema.parse(ctx.request.body)

      yield { type: 'thread', threadId }

      const config = hitlThreadConfig(threadId)
      const snapshot = await hitlGraphApp.getState(config)
      if (!getInterruptPayload(snapshot)) {
        throw new Error('thread not found or not waiting for approval')
      }

      const stream = await hitlGraphApp.stream(
        new Command({
          resume: {
            approved: approval.approved,
            reason: approval.reason,
          },
        }),
        { ...config, streamMode: 'updates' },
      )

      for await (const update of stream)
        yield update

      const finalSnapshot = await hitlGraphApp.getState(config)
      if (finalSnapshot.values?.result) {
        yield { type: 'final', data: finalSnapshot.values.result }
      }
    }

    ctx.body = events()
  }
}
