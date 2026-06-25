import type { BaseMessage } from '@langchain/core/messages'
import type { ApprovalDecision, HitlWorkflowResult } from './hitl/types'
import { AIMessage } from '@langchain/core/messages'
import {
  Annotation,
  interrupt,
  StateGraph,
} from '@langchain/langgraph'
import { sleep } from 'radash'

const HitlState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  input: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
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

async function prepare(_state: typeof HitlState.State) {
  await sleep(1000)
  return {}
}

async function humanApproval(state: typeof HitlState.State) {
  await sleep(1000)
  // approval 中断 payload（与 @agent/protocol 的 InterruptRequest approval 分支同构，去掉 interruptId——langgraph 自动生成）
  const decision = interrupt<{ type: 'approval', message: string, details: string }, ApprovalDecision>({
    type: 'approval',
    message: `请确认敏感操作：${state.input}`,
    details: state.input,
  })
  return { approval: decision }
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
  await sleep(500)
  return {
    result: {
      status: 'approved' as const,
      action: 'execute_tool',
      toolInput: state.input,
    },
    messages: [new AIMessage(`已批准执行：${state.input}`)],
  }
}

export const hitlGraph = new StateGraph(HitlState)
  .addNode('prepare', prepare)
  .addNode('human_approval', humanApproval)
  .addNode('execute', execute)
  .addEdge('__start__', 'prepare')
  .addEdge('prepare', 'human_approval')
  .addEdge('human_approval', 'execute')
  .addEdge('execute', '__end__')
