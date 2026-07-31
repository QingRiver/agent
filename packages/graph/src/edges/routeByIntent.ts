import type { EditorChatIntent } from '@agent/proto'

/** editor chat 路径：intent=write → writeEdit，否则 chatbot */
export function routeByIntent(state: { intent: EditorChatIntent | null }): 'writeEdit' | 'chatbot' {
  return state.intent === 'write' ? 'writeEdit' : 'chatbot'
}
