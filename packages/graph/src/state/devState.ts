import type { ApprovalDecision } from '@agent/protocol'
import type { BaseMessage } from '@langchain/core/messages'
import { Annotation } from '@langchain/langgraph'

export type DevIntent = 'weather' | 'simpleTool' | 'hitlDemo' | null

/** hitlDemo 支路执行结果 */
export type HitlDemoResult
  = | { status: 'rejected', reason: string }
    | {
      status: 'approved'
      action: string
      toolInput: string
      userPurpose: string
      priority: string
      extras: string[]
    }

export const DevState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  devIntent: Annotation<DevIntent>({
    reducer: (_x, y) => y,
    default: () => null,
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
  result: Annotation<HitlDemoResult | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
})

export type DevStateType = typeof DevState.State
