import type { HitlWorkflowResult } from '@agent/graph'

export function buildHitlInput(input: string) {
  return { input }
}

export function formatHitlResult(result: HitlWorkflowResult | undefined): string {
  if (!result)
    return '工作流已结束。'
  if (result.status === 'approved')
    return `已批准执行：${result.toolInput}`
  return `已拒绝：${result.reason}`
}
