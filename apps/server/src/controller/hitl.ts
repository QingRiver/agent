import type { Context } from 'hono'
import type { AppEnv } from '../types'
import { randomUUID } from 'node:crypto'
import { Command } from '@langchain/langgraph'
import { z } from 'zod'
import {
  getInterruptPayload,
  hitlGraphApp,
  hitlThreadConfig,
} from '../graphs/hitlGraph'
import { Controller, Get, Post } from '../router/decorator'
import { createSseResponse } from '../utils/sse'

@Controller('/hitl')
export class HitlController {
  static readonly #approvalBodySchema = z.object({
    approved: z.boolean(),
    reason: z.string().optional(),
  })

  static readonly #threadIdParamSchema = z.uuid()

  @Get('/workflow/sse')
  async workflowStartSse(c: Context<AppEnv>): Promise<Response> {
    const input = c.req.query('input')?.trim() || '向账户 0x123... 转账 100 ETH'

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

    return createSseResponse(events())
  }

  @Post('/workflow/:threadId/resume')
  async workflowResumeSse(c: Context<AppEnv>): Promise<Response> {
    const threadId = HitlController.#threadIdParamSchema.parse(c.req.param('threadId'))
    const approval = HitlController.#approvalBodySchema.parse(await c.req.json())

    async function* events() {
      yield { type: 'thread', threadId }

      const config = hitlThreadConfig(threadId)
      const snapshot = await hitlGraphApp.getState(config)
      if (!getInterruptPayload(snapshot))
        throw new Error('thread not found or not waiting for approval')

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

    return createSseResponse(events())
  }
}
