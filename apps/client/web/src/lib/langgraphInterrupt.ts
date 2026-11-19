import type { InterruptRequest, InterruptResponse } from '@agent/proto'
import { InterruptRequestValueSchema } from '@agent/proto'

/** assistant-ui / LangGraph 中断对象（`{ id, value }`）→ 卡片用 InterruptRequest */
export function toInterruptRequest(interrupt: unknown): InterruptRequest | null {
  if (interrupt == null || typeof interrupt !== 'object')
    return null
  const record = interrupt as { id?: unknown, value?: unknown }
  if (typeof record.id !== 'string' || record.id === '')
    return null
  const parsed = InterruptRequestValueSchema.safeParse(record.value)
  if (!parsed.success)
    return null
  return { interruptId: record.id, ...parsed.data }
}

/**
 * 卡片 payload → LangGraph resume Command。
 * assistant-ui 把 resume 标成 string；实际应传结构化 payload。
 */
export function toLangGraphResumeCommand(payload: unknown): { resume: unknown } {
  return { resume: payload }
}

/** InterruptResponse → resume Command（保留 interruptId 供多中断路由） */
export function interruptResponseToResumeCommand(response: InterruptResponse): { resume: unknown } {
  return toLangGraphResumeCommand(response.payload)
}
