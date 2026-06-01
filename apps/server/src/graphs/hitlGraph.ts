import {
  Annotation,
  MemorySaver,
  StateGraph,
  interrupt,
} from '@langchain/langgraph'
import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import { sleep } from 'radash'

export interface ApprovalDecision {
  approved: boolean
  reason?: string
}

export type HitlWorkflowResult =
  | { status: 'rejected', reason: string }
  | { status: 'approved', action: string, toolInput: string }

export interface HumanApprovalInterrupt {
  status: 'wait_for_human_approval'
  data: string
}

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

async function checkSafety(_state: typeof HitlState.State) {
  await sleep(1000)
  return {}
}

async function humanApproval(state: typeof HitlState.State) {
  await sleep(1000)
  const approval = interrupt<HumanApprovalInterrupt, ApprovalDecision>({
    status: 'wait_for_human_approval',
    data: state.input,
  })
  return { approval }
}

async function finalize(state: typeof HitlState.State) {
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

const workflow = new StateGraph(HitlState)
  .addNode('check_safety', checkSafety)
  .addNode('human_approval', humanApproval)
  .addNode('finalize', finalize)
  .addEdge('__start__', 'check_safety')
  .addEdge('check_safety', 'human_approval')
  .addEdge('human_approval', 'finalize')
  .addEdge('finalize', '__end__')

const checkpointer = new MemorySaver()

export const hitlGraphApp = workflow.compile({ checkpointer })

export function hitlThreadConfig(threadId: string): LangGraphRunnableConfig {
  return { configurable: { thread_id: threadId } }
}

export function getInterruptPayload(
  snapshot: Awaited<ReturnType<typeof hitlGraphApp.getState>>,
): HumanApprovalInterrupt | undefined {
  for (const task of snapshot.tasks) {
    for (const item of task.interrupts) {
      const value = item.value as HumanApprovalInterrupt | undefined
      if (value?.status === 'wait_for_human_approval')
        return value
    }
  }
  return undefined
}
