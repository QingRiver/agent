import type { DevStateType } from '../state/devState'
import { AIMessage } from '@langchain/core/messages'
import { EXTRA_OPTIONS, PRIORITY_OPTIONS } from './collectHitlDemo'

function formatExtras(values: string[]): string {
  if (values.length === 0)
    return '无'
  return values
    .map(v => EXTRA_OPTIONS.find(o => o.value === v)?.label ?? v)
    .join('、')
}

function formatPriority(value: string): string {
  return PRIORITY_OPTIONS.find(o => o.value === value)?.label ?? value
}

function buildSummary(state: DevStateType): string {
  return [
    `操作：${state.input}`,
    `目的：${state.userPurpose}`,
    `优先级：${formatPriority(state.priority)}`,
    `附加：${formatExtras(state.extras)}`,
  ].join('\n')
}

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

  const summary = buildSummary(state)
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
