import type { EditorChatIntent } from '@agent/protocol'
import type { BaseMessage } from '@langchain/core/messages'
import { Annotation } from '@langchain/langgraph'

export const EditorChatState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  intent: Annotation<EditorChatIntent | null>({
    reducer: (_x, y) => y,
    default: () => null,
  }),
})

export type EditorChatStateType = typeof EditorChatState.State
