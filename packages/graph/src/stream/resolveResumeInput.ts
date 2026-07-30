import type { RunAgentInput } from '@ag-ui/core'
import type { ApprovalDecision } from '@agent/protocol'

/**
 * 从 RunAgentInput 解析 LangGraph `Command({ resume })` 的 resume 值。
 * 只认 AG-UI 标准 `resume[]`（须带 interruptId）；不再兼容 CopilotKit
 * `forwardedProps.command.resume` / `useInterrupt().resolve()`。
 */
export function resolveResumeFromRunAgentInput(input: RunAgentInput): unknown | undefined {
  const entries = input.resume
  if (entries == null || entries.length === 0)
    return undefined

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

  return undefined
}
