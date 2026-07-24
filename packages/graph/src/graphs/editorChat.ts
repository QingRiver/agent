import { END, START, StateGraph } from '@langchain/langgraph'
import { routeByIntent } from '../edges/routeByIntent'
import { makeChatbotNode } from '../nodes/chatbot'
import { classifyEditorIntent } from '../nodes/classifyEditorIntent'
import { makeWriteEditNode } from '../nodes/writeEdit'
import { ASK_SYSTEM_PROMPT } from '../prompts/editorPrompts'
import { EditorChatState } from '../state/editorChatState'

export const editorChatGraph = new StateGraph(EditorChatState)
  .addNode('classifyIntent', classifyEditorIntent)
  .addNode('chatbot', makeChatbotNode({ systemPrompt: ASK_SYSTEM_PROMPT }))
  .addNode('writeEdit', makeWriteEditNode({ editCase: 'document' }))
  .addEdge(START, 'classifyIntent')
  .addConditionalEdges('classifyIntent', routeByIntent, {
    chatbot: 'chatbot',
    writeEdit: 'writeEdit',
  })
  .addEdge('chatbot', END)
  .addEdge('writeEdit', END)
