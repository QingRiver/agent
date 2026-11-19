import type { SelectOption } from '@agent/proto'
import type { DevStateType } from '../state/devState'

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

export function formatPriority(value: string): string {
  return PRIORITY_OPTIONS.find(o => o.value === value)?.label ?? value
}

export function formatExtras(values: string[]): string {
  if (values.length === 0)
    return '无'
  return values
    .map(v => EXTRA_OPTIONS.find(o => o.value === v)?.label ?? v)
    .join('、')
}

export function buildHitlSummary(state: Pick<DevStateType, 'input' | 'userPurpose' | 'priority' | 'extras'>): string {
  return [
    `操作：${state.input}`,
    `目的：${state.userPurpose}`,
    `优先级：${formatPriority(state.priority)}`,
    `附加：${formatExtras(state.extras)}`,
  ].join('\n')
}
