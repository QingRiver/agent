import type { ValidationTargets } from 'hono'
import type { ZodType } from 'zod'
import { zValidator as baseZValidator } from '@hono/zod-validator'
import { formatSseError } from '../utils/sse'

export function zValidator<T extends ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) {
  return baseZValidator(target, schema, (result, c) => {
    if (!result.success)
      return c.json({ error: formatSseError(result.error) }, 400)
  })
}
