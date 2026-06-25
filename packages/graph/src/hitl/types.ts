/**
 * HITL 图执行结果类型。
 *
 * 中断协议类型（ApprovalDecision / InterruptRequest / PendingInterrupt）已收敛到
 * `@agent/protocol`，此处仅保留图执行结果 `HitlWorkflowResult`（与中断协议无关）。
 */
export type HitlWorkflowResult
  = | { status: 'rejected', reason: string }
    | { status: 'approved', action: string, toolInput: string }

export type { ApprovalDecision } from '@agent/protocol'
