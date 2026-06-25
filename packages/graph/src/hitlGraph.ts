import type { ApprovalDecision, SelectOption } from '@agent/protocol'
import type { BaseMessage } from '@langchain/core/messages'
import { AIMessage } from '@langchain/core/messages'
import {
  Annotation,
  interrupt,
  StateGraph,
} from '@langchain/langgraph'

/** hitl 图执行结果（仅本图 state.result 使用） */
type HitlWorkflowResult
  = | { status: 'rejected', reason: string }
    | {
      status: 'approved'
      action: string
      toolInput: string
      userPurpose: string
      priority: string
      extras: string[]
    }

const PRIORITY_OPTIONS: SelectOption[] = [
  { label: '低', value: 'low', description: '可延后处理' },
  { label: '中', value: 'medium', description: '常规处理' },
  { label: '高', value: 'high', description: '优先处理' },
]

const EXTRA_OPTIONS: SelectOption[] = [
  { label: '记录审计日志', value: 'audit' },
  { label: '发送通知', value: 'notify' },
  { label: '生成报告', value: 'report' },
]

const HitlState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  input: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),
  userPurpose: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),
  priority: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),
  extras: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  approval: Annotation<ApprovalDecision | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  result: Annotation<HitlWorkflowResult | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
})

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

function buildSummary(state: typeof HitlState.State): string {
  return [
    `操作：${state.input}`,
    `目的：${state.userPurpose}`,
    `优先级：${formatPriority(state.priority)}`,
    `附加：${formatExtras(state.extras)}`,
  ].join('\n')
}

/**
 * 串联 4 种 HITL 中断（与 @agent/protocol / InterruptCard 一一对应）：
 * input → select → multiSelect → approval。
 * 每次 interrupt 暂停图；外部 Command({ resume: payload }) 后继续下一步。
 */
async function collectHitl(state: typeof HitlState.State) {
  const inputResp = interrupt<
    { type: 'input', message: string, placeholder?: string },
    { value: string }
  >({
    type: 'input',
    message: '请简要描述本次操作目的',
    placeholder: '例如：整理季度报表',
  })

  const selectResp = interrupt<
    { type: 'select', message: string, options: SelectOption[] },
    { value: string }
  >({
    type: 'select',
    message: '请选择优先级',
    options: PRIORITY_OPTIONS,
  })

  const multiResp = interrupt<
    { type: 'multiSelect', message: string, options: SelectOption[] },
    { values: string[] }
  >({
    type: 'multiSelect',
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

  const decision = interrupt<
    { type: 'approval', message: string, details: string },
    ApprovalDecision
  >({
    type: 'approval',
    message: '请确认是否执行以下操作',
    details: summary,
  })

  return { ...partial, approval: decision }
}

async function execute(state: typeof HitlState.State) {
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

export const hitlGraph = new StateGraph(HitlState)
  .addNode('collect_hitl', collectHitl)
  .addNode('execute', execute)
  .addEdge('__start__', 'collect_hitl')
  .addEdge('collect_hitl', 'execute')
  .addEdge('execute', '__end__')
