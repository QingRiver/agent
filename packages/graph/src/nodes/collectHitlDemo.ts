import type { SelectOption } from '@agent/protocol'
import type { DevStateType } from '../state/devState'
import {
  hitlApproval,
  hitlInput,
  hitlMultiSelect,
  hitlSelect,
} from '../tools/hitl/interrupt'

export const PRIORITY_OPTIONS: SelectOption[] = [
  { label: '低', value: 'low', description: '可延后处理' },
  { label: '中', value: 'medium', description: '常规处理' },
  { label: '高', value: 'high', description: '优先处理' },
]

export const EXTRA_OPTIONS: SelectOption[] = [
  { label: '记录审计日志', value: 'audit' },
  { label: '发送通知', value: 'notify' },
  { label: '生成报告', value: 'report' },
]

function formatPriority(value: string): string {
  return PRIORITY_OPTIONS.find(o => o.value === value)?.label ?? value
}

function formatExtras(values: string[]): string {
  if (values.length === 0)
    return '无'
  return values
    .map(v => EXTRA_OPTIONS.find(o => o.value === v)?.label ?? v)
    .join('、')
}

/** HITL 审批演示：input → select → multiSelect → approval */
export async function collectHitlDemo(state: DevStateType) {
  const inputResp = await hitlInput({
    message: '请简要描述本次操作目的',
    placeholder: '例如：整理季度报表',
  })

  const selectResp = await hitlSelect({
    message: '请选择优先级',
    options: PRIORITY_OPTIONS,
  })

  const multiResp = await hitlMultiSelect({
    message: '请选择附加选项（可多选）',
    options: EXTRA_OPTIONS,
  })

  const partial = {
    userPurpose: inputResp.value,
    priority: selectResp.value,
    extras: multiResp.values,
  }

  const summary = [
    `操作：${state.input}`,
    `目的：${partial.userPurpose}`,
    `优先级：${formatPriority(partial.priority)}`,
    `附加：${formatExtras(partial.extras)}`,
  ].join('\n')

  const decision = await hitlApproval({
    message: '请确认是否执行以下操作',
    details: summary,
  })

  return { ...partial, approval: decision }
}
