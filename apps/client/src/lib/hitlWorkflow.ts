import { consumeSse } from './parseSse'

export interface HitlSseEvent {
  type: string
  phase?: string
  step?: number
  threadId?: string
  /** @deprecated 与 threadId 相同，兼容旧事件 */
  sessionId?: string
  data?: unknown
  message?: string
}

export interface ApprovalDecision {
  approved: boolean
  reason?: string
}

export async function startHitlWorkflow(
  input: string,
  onEvent: (event: HitlSseEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const url = `/api/hitl/workflow/sse?input=${encodeURIComponent(input)}`
  const response = await fetch(url, signal ? { signal } : undefined)

  if (!response.ok)
    throw new Error(`Start workflow failed: ${response.status}`)

  await consumeSse(response, payload => onEvent(payload as HitlSseEvent))
}

export async function resumeHitlWorkflow(
  threadId: string,
  decision: ApprovalDecision,
  onEvent: (event: HitlSseEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(decision),
  }
  if (signal)
    init.signal = signal

  const response = await fetch(`/api/hitl/workflow/${threadId}/resume`, init)

  if (!response.ok)
    throw new Error(`Resume workflow failed: ${response.status}`)

  await consumeSse(response, payload => onEvent(payload as HitlSseEvent))
}
