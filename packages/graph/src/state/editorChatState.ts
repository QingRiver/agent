import type { EditorChatIntent } from '@agent/proto'
import { Annotation, MessagesAnnotation } from '@langchain/langgraph'
import { lastValue } from './lastValue'

export const EditorChatState = Annotation.Root({
  ...MessagesAnnotation.spec,
  intent: lastValue<EditorChatIntent | null>(() => null),
})

export type EditorChatStateType = typeof EditorChatState.State
