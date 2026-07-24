import type { BaseMessage } from '@langchain/core/messages'
import { Annotation } from '@langchain/langgraph'

export const WriterState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
})

export type WriterStateType = typeof WriterState.State
