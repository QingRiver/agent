export interface ApprovalDecision {
  approved: boolean
  reason?: string
}

export type HitlWorkflowResult
  = | { status: 'rejected', reason: string }
    | { status: 'approved', action: string, toolInput: string }

export interface ApprovalInterruptPayload {
  type: 'approval'
  message: string
  details: string
}
