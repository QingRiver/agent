import type { BaseMessage } from '@langchain/core/messages'
import { SystemMessage } from '@langchain/core/messages'
import { createChatModel } from '../utils/chatModel'

export interface ChatbotNodeOptions {
  systemPrompt: string
  temperature?: number
}

/** 通用对话节点：注入 system（若首条已是 system 则不重复）后 invoke */
export function makeChatbotNode(opts: ChatbotNodeOptions) {
  const llm = createChatModel({ temperature: opts.temperature ?? 0.7 })

  return async (state: { messages: BaseMessage[] }): Promise<{ messages: BaseMessage[] }> => {
    const messages = state.messages[0]?.type === 'system'
      ? state.messages
      : [new SystemMessage(opts.systemPrompt), ...state.messages]
    const response = await llm.invoke(messages)
    return { messages: [response] }
  }
}
