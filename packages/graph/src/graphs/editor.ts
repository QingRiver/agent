import { END, START, StateGraph } from '@langchain/langgraph'
import { routeByEditorPath } from '../edges/routeByEditorPath'
import { routeByIntent } from '../edges/routeByIntent'
import { makeChatbotNode } from '../nodes/chatbot'
import { classifyEditorIntent } from '../nodes/classifyEditorIntent'
import { makeWriteEditNode } from '../nodes/writeEdit'
import { EDITOR_ASK_SYSTEM_PROMPT } from '../prompts/editorPrompts'
import { EditorChatState } from '../state/editorChatState'

export type { EditorPath } from '../edges/routeByEditorPath'
export { WRITER_CHANGE_SUMMARIES_EVENT, type WriterChangeSummary } from '@agent/proto'

/**
 * 文本编辑器统一图。
 * `forwardedProps.editorPath`：
 * - `job`：润色 / ⌘K → 直达 writeEdit（无 thinking）
 * - `chat`：对话 → classify → chatbot | writeEdit（Write 可 reasoning）
 */
export const editorGraph = new StateGraph(EditorChatState)
  .addNode('classifyIntent', classifyEditorIntent)
  .addNode('chatbot', makeChatbotNode({ systemPrompt: EDITOR_ASK_SYSTEM_PROMPT }))
  .addNode('writeEdit', makeWriteEditNode())
  .addConditionalEdges(START, routeByEditorPath, {
    writeEdit: 'writeEdit',
    classifyIntent: 'classifyIntent',
  })
  .addConditionalEdges('classifyIntent', routeByIntent, {
    chatbot: 'chatbot',
    writeEdit: 'writeEdit',
  })
  .addEdge('chatbot', END)
  .addEdge('writeEdit', END)
