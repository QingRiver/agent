import type { RunAgentInput } from '@ag-ui/core'
import type { ApprovalDecision } from '../hitl/types'

function extractForwardedCommand(input: RunAgentInput): { resume?: unknown } | undefined {
  const command = (input.forwardedProps as { command?: { resume?: unknown } } | undefined)
    ?.command
  if (!command)
    return undefined
  return command
}

function parseApprovalDecision(raw: unknown): ApprovalDecision | undefined {
  if (raw == null)
    return undefined

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as ApprovalDecision
      if (typeof parsed.approved === 'boolean')
        return parsed
    }
    catch {
      return { approved: true }
    }
    return undefined
  }

  if (typeof raw === 'object' && 'approved' in raw) {
    const decision = raw as ApprovalDecision
    if (typeof decision.approved === 'boolean')
      return decision
  }

  return undefined
}

/**
 * 从 RunAgentInput 解析 LangGraph `Command({ resume })` 的 resume 值。
 * 优先级：`resume[]`（AG-UI 规范）→ `forwardedProps.command.resume`（CopilotKit）。
 */
export function resolveResumeFromRunAgentInput(input: RunAgentInput): unknown | undefined {
  const entries = input.resume
  if (entries != null && entries.length > 0) {
    const resolved = entries.filter(e => e.status === 'resolved')
    if (resolved.length === 1)
      return resolved[0]?.payload
    if (resolved.length > 1) {
      return Object.fromEntries(
        resolved.map(e => [e.interruptId, e.payload]),
      )
    }
    const cancelled = entries.filter(e => e.status === 'cancelled')
    if (cancelled.length === entries.length)
      return { approved: false, reason: '用户取消' } satisfies ApprovalDecision
  }

  const legacy = extractForwardedCommand(input)?.resume
  if (legacy == null)
    return undefined

  const decision = parseApprovalDecision(legacy)
  return decision ?? legacy
}
