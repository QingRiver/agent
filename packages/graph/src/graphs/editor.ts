import { END, START, StateGraph } from '@langchain/langgraph'
import { EDITOR_ENTRY_ENDS, routeEditorEntry } from '../edges/routeByEditorPath'
import { makeChatbotNode } from '../nodes/chatbot'
import { CLASSIFY_INTENT_ENDS, classifyEditorIntent } from '../nodes/classifyEditorIntent'
import { makeWriteEditNode } from '../nodes/writeEdit'
import { EDITOR_ASK_SYSTEM_PROMPT } from '../prompts/editorPrompts'
import { EditorChatState } from '../state/editorChatState'

export type { EditorPath } from '../edges/routeByEditorPath'
export { WRITER_CHANGE_SUMMARIES_EVENT, type WriterChangeSummary } from '@agent/proto'

/**
 * 文本编辑器统一图。
 * `configurable.editorPath`：
 * - `job`：润色 / ⌘K → 直达 writeEdit（无 thinking）
 * - `chat`：对话 → classify → chatbot | writeEdit（Write 可 reasoning）
 */
export const editorGraph = new StateGraph(EditorChatState)
  .addNode('entry', routeEditorEntry, { ends: [...EDITOR_ENTRY_ENDS] })
  .addNode('classifyIntent', classifyEditorIntent, { ends: [...CLASSIFY_INTENT_ENDS] })
  .addNode('chatbot', makeChatbotNode({ systemPrompt: EDITOR_ASK_SYSTEM_PROMPT }))
  .addNode('writeEdit', makeWriteEditNode())
  .addEdge(START, 'entry')
  .addEdge('chatbot', END)
  .addEdge('writeEdit', END)
