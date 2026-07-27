import type { ApprovalDecision, InterruptRequest, PendingInterrupt } from '@agent/protocol'
import { InterruptRequestValueSchema, PendingInterruptSchema } from '@agent/protocol'

/**
 * 中断协议契约 —— 与 `@agent/protocol` 统一，供任意 agent 的 Interrupt UI 使用。
 *
 * live：CopilotKit `useInterrupt` 的 event.value（无 interruptId）。
 * checkpoint：`threadState.pendingInterrupt`。
 */

export type { ApprovalDecision, InterruptRequest, PendingInterrupt }

export function narrowInterruptRequest(value: unknown): InterruptRequest | null {
  const parsed = InterruptRequestValueSchema.safeParse(value)
  if (!parsed.success)
    return null
  return { interruptId: '', ...parsed.data } as InterruptRequest
}

export function narrowPendingInterrupt(value: unknown): PendingInterrupt | null {
  const parsed = PendingInterruptSchema.safeParse(value)
  if (!parsed.success)
    return null
  return parsed.data
}
