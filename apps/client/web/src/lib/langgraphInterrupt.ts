import type { InterruptRequest } from '@agent/proto'
import { InterruptRequestValueSchema } from '@agent/proto'

/** assistant-ui 中断对象（`{ id, value }`）收成 InterruptCard 的请求。 */
export function narrowLangGraphInterrupt(interrupt: unknown): InterruptRequest | null {
  if (interrupt == null || typeof interrupt !== 'object')
    return null
  const record = interrupt as { id?: unknown, value?: unknown }
  if (typeof record.id !== 'string' || record.id === '')
    return null
  const parsed = InterruptRequestValueSchema.safeParse(record.value)
  if (!parsed.success)
    return null
  return { interruptId: record.id, ...parsed.data } as InterruptRequest
}
