import type { AppEnv } from '../types'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { RscHandlers } from '../handlers/rsc'
import { handleAppError } from '../http/errors'
import { requireAuth } from '../middleware/authMiddleware'

const RenderBodySchema = z.object({
  source: z.string().optional(),
})

export const rscRoutes = new Hono<AppEnv>()
  .onError(handleAppError)
  .use('*', requireAuth)
  /** 透传 rsc-engine Flight 流；勿 json() 消费 body */
  .post(
    '/render',
    zValidator('json', RenderBodySchema),
    c => RscHandlers.render(c.req.valid('json')),
  )
