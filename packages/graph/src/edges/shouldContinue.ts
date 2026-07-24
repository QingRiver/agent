import type { BaseMessage } from '@langchain/core/messages'
import { AIMessage } from '@langchain/core/messages'

/** ReAct：末条 AIMessage 有 tool_calls → tools，否则结束 */
export function shouldContinue(
  state: { messages: BaseMessage[] },
): 'tools' | '__end__' {
  const lastMessage = state.messages.at(-1)
  if (lastMessage && AIMessage.isInstance(lastMessage) && lastMessage.tool_calls?.length)
    return 'tools'
  return '__end__'
}
