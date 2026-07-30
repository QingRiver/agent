import type { InterruptRequest } from '@agent/protocol'
import { InterruptRequestValueSchema } from '@agent/protocol'

/**
 * 中断协议契约 —— 与 `@agent/protocol` 统一，供 Interrupt UI 使用。
 *
 * 单投影：UI 只从 `agent.pendingInterrupts`（AG-UI Interrupt）收窄。
 */

/** AG-UI `pendingInterrupts[]` 条目的最小形状 */
export interface AgUiPendingInterrupt {
  id: string
  metadata?: unknown
}

/**
 * 从 AG-UI pending interrupt（connect 重放或 live RUN_FINISHED）收窄为 InterruptRequest。
 * metadata 为协议 value（无 interruptId）；id 补回。
 */
export function narrowAgUiPendingInterrupt(
  pending: AgUiPendingInterrupt | null | undefined,
): InterruptRequest | null {
  if (pending == null || !pending.id)
    return null

  const metadata = pending.metadata
  if (metadata == null || typeof metadata !== 'object' || Array.isArray(metadata))
    return null

  const record = metadata as Record<string, unknown>
  const nestedPayload = record.payload
  const candidate = record.type != null
    ? record
    : nestedPayload != null && typeof nestedPayload === 'object' && !Array.isArray(nestedPayload)
      ? nestedPayload
      : null

  const parsed = InterruptRequestValueSchema.safeParse(candidate)
  if (!parsed.success)
    return null
  return { interruptId: pending.id, ...parsed.data } as InterruptRequest
}
