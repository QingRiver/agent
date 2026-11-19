import type { DevStateType } from '../state/devState'
import { AIMessage } from '@langchain/core/messages'
import { buildHitlSummary } from './hitlDemoFormat'

/** 原 hitlGraph execute：按 approval 结果写 AIMessage */
export async function executeHitlDemo(state: DevStateType) {
  if (!state.approval?.approved) {
    const reason = state.approval?.reason ?? '用户拒绝'
    return {
      result: {
        status: 'rejected' as const,
        reason,
      },
      messages: [new AIMessage(`已拒绝：${reason}`)],
    }
  }

  const summary = buildHitlSummary(state)
  return {
    result: {
      status: 'approved' as const,
      action: 'execute_tool',
      toolInput: state.input,
      userPurpose: state.userPurpose,
      priority: state.priority,
      extras: state.extras,
    },
    messages: [new AIMessage(`已批准执行：\n${summary}`)],
  }
}
