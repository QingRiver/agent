import type { RunAgentInput } from '@ag-ui/core'
import type { ApprovalDecision } from '@agent/graph'

function extractForwardedCommand(input: RunAgentInput): { resume?: unknown } | undefined {
  const command = (input.forwardedProps as { command?: { resume?: unknown } } | undefined)
    ?.command
  if (!command)
    return undefined
  return command
}

export function extractApprovalResume(
  input: RunAgentInput,
): ApprovalDecision | undefined {
  const raw = extractForwardedCommand(input)?.resume
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

  if (typeof raw === 'object' && raw != null && 'approved' in raw) {
    const decision = raw as ApprovalDecision
    if (typeof decision.approved === 'boolean')
      return decision
  }

  return undefined
}
