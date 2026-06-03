import type { ApprovalInterruptValue } from '../components/hitl/ApprovalCard'
import { z } from 'zod'

/** 与 server / `packages/graph` `ApprovalInterruptPayload` 一致（CUSTOM on_interrupt value） */
export const approvalInterruptValueSchema = z.object({
  type: z.literal('approval'),
  message: z.string(),
  details: z.string(),
})

export function narrowApprovalInterruptValue(
  value: unknown,
): ApprovalInterruptValue | null {
  const parsed = approvalInterruptValueSchema.safeParse(value)
  if (!parsed.success)
    return null
  return parsed.data
}
