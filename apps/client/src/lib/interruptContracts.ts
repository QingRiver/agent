import type { ApprovalDecision, InterruptRequest, PendingInterrupt } from '@agent/protocol'
import { PendingInterruptSchema } from '@agent/protocol'
import { z } from 'zod'

/**
 * 中断协议契约 —— 与 `@agent/protocol` 统一，供任意 agent 的 Interrupt UI 使用。
 *
 * live：CopilotKit `useInterrupt` 的 event.value（无 interruptId）。
 * checkpoint：`threadState.pendingInterrupt`。
 */

export type { ApprovalDecision, InterruptRequest, PendingInterrupt }

const optionSchema = z.object({
  label: z.string(),
  value: z.string(),
  description: z.string().optional(),
})

const interruptValueSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('input'), message: z.string(), placeholder: z.string().optional() }),
  z.object({ type: z.literal('select'), message: z.string(), options: z.array(optionSchema) }),
  z.object({ type: z.literal('multiSelect'), message: z.string(), options: z.array(optionSchema) }),
  z.object({ type: z.literal('modal'), title: z.string(), body: z.string(), actions: z.array(z.string()) }),
  z.object({ type: z.literal('approval'), message: z.string(), details: z.string() }),
  z.object({ type: z.literal('unlock'), message: z.string(), key: z.string() }),
])

export function narrowInterruptRequest(value: unknown): InterruptRequest | null {
  const parsed = interruptValueSchema.safeParse(value)
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
