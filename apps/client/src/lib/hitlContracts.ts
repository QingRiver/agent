import type { ApprovalDecision, InterruptRequest, PendingInterrupt } from '@agent/protocol'
import { PendingInterruptSchema } from '@agent/protocol'
import { z } from 'zod'

/**
 * 中断协议契约 —— 与 `@agent/protocol` 统一。
 *
 * live 路径:CopilotKit `useInterrupt` 的 event.value(CUSTOM on_interrupt value)
 *   形状 = InterruptRequest 去掉 interruptId(langgraph task 生成 id 在 event 元数据)。
 * checkpoint 路径:`threadState.pendingInterrupt` 来自 `PendingInterruptSchema` hydrate。
 * 两路都用 `narrowInterruptRequest` 收窄为 InterruptRequest,按 type 分发 UI。
 */

export type { ApprovalDecision, InterruptRequest, PendingInterrupt }

const optionSchema = z.object({
  label: z.string(),
  value: z.string(),
  description: z.string().optional(),
})

/** live 路径 payload(无 interruptId)的 zod 镜像 */
const interruptValueSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('input'), message: z.string(), placeholder: z.string().optional() }),
  z.object({ type: z.literal('select'), message: z.string(), options: z.array(optionSchema) }),
  z.object({ type: z.literal('multiSelect'), message: z.string(), options: z.array(optionSchema) }),
  z.object({ type: z.literal('modal'), title: z.string(), body: z.string(), actions: z.array(z.string()) }),
  z.object({ type: z.literal('approval'), message: z.string(), details: z.string() }),
  z.object({ type: z.literal('unlock'), message: z.string(), key: z.string() }),
])

/**
 * 从 live 事件 value 收窄为 InterruptRequest(interruptId 缺省,UI 不需要)。
 * 返回的 type 字段供 InterruptRenderer 分发。
 */
export function narrowInterruptRequest(value: unknown): InterruptRequest | null {
  const parsed = interruptValueSchema.safeParse(value)
  if (!parsed.success)
    return null
  // interruptId 在 live 路径不可得,填占位以满足类型;UI 不依赖它
  return { interruptId: '', ...parsed.data } as InterruptRequest
}

/** 从 checkpoint pendingInterrupt 收窄(launcher 已带 interruptId) */
export function narrowPendingInterrupt(value: unknown): PendingInterrupt | null {
  const parsed = PendingInterruptSchema.safeParse(value)
  if (!parsed.success)
    return null
  return parsed.data
}
