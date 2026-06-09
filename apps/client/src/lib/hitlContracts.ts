import { z } from 'zod'

/** 与 `packages/graph` `ApprovalInterruptPayload` 一致（CUSTOM on_interrupt value 或 interrupt metadata） */
export interface ApprovalInterruptValue {
  type: 'approval'
  message: string
  details: string
}

export interface ApprovalDecision {
  approved: boolean
  reason?: string
}

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
