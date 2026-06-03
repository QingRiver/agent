import type {
  ApprovalDecision,
  ApprovalInterruptPayload,
  HitlWorkflowResult,
} from './hitl/types.js'
import {
  Annotation,
  interrupt,
  StateGraph,
} from '@langchain/langgraph'
import { sleep } from 'radash'

const HitlState = Annotation.Root({
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
  const decision = interrupt<ApprovalInterruptPayload, ApprovalDecision>({
    type: 'approval',
    message: `请确认敏感操作：${state.input}`,
    details: state.input,
  })
  return { approval: decision }
}

async function execute(state: typeof HitlState.State) {
  if (!state.approval?.approved) {
    return {
      result: {
        status: 'rejected' as const,
        reason: state.approval?.reason ?? '用户拒绝',
      },
    }
  }
  await sleep(500)
  return {
    result: {
      status: 'approved' as const,
      action: 'execute_tool',
      toolInput: state.input,
    },
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
