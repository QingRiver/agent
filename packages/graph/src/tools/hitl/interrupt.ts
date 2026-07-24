/**
 * 平台 HITL interrupt helpers —— 与 ask_* / InterruptCard / @agent/protocol 同构。
 * payload 不含 interruptId（由 LangGraph runtime 生成）。
 * select / multiSelect 的 UI 末尾固定带自定义输入行（与选项对齐），返回值可能不在 options 内。
 */
import type { ApprovalDecision, SelectOption } from '@agent/protocol'
import { interrupt } from '@langchain/langgraph'

export interface HitlOption {
  label: string
  value: string
  description?: string | undefined
}

export async function hitlInput(params: {
  message: string
  placeholder?: string
}): Promise<{ value: string }> {
  return interrupt<
    { type: 'input', message: string, placeholder?: string },
    { value: string }
  >({
    type: 'input',
    message: params.message,
    ...(params.placeholder != null ? { placeholder: params.placeholder } : {}),
  })
}

export async function hitlSelect(params: {
  message: string
  options: HitlOption[] | SelectOption[]
}): Promise<{ value: string }> {
  return interrupt<
    { type: 'select', message: string, options: HitlOption[] },
    { value: string }
  >({
    type: 'select',
    message: params.message,
    options: params.options.map(o => ({
      label: o.label,
      value: o.value,
      ...(o.description != null ? { description: o.description } : {}),
    })),
  })
}

export async function hitlMultiSelect(params: {
  message: string
  options: HitlOption[] | SelectOption[]
}): Promise<{ values: string[] }> {
  return interrupt<
    { type: 'multiSelect', message: string, options: HitlOption[] },
    { values: string[] }
  >({
    type: 'multiSelect',
    message: params.message,
    options: params.options.map(o => ({
      label: o.label,
      value: o.value,
      ...(o.description != null ? { description: o.description } : {}),
    })),
  })
}

export async function hitlModal(params: {
  title: string
  body: string
  actions: string[]
}): Promise<{ action: string }> {
  return interrupt<
    { type: 'modal', title: string, body: string, actions: string[] },
    { action: string }
  >({
    type: 'modal',
    title: params.title,
    body: params.body,
    actions: params.actions,
  })
}

export async function hitlApproval(params: {
  message: string
  details: string
}): Promise<ApprovalDecision> {
  return interrupt<
    { type: 'approval', message: string, details: string },
    ApprovalDecision
  >({
    type: 'approval',
    message: params.message,
    details: params.details,
  })
}
