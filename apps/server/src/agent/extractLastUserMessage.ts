import type { RunAgentInput } from '@ag-ui/core'
import { HumanMessage } from '@langchain/core/messages'

export function extractLastUserMessage(
  input: RunAgentInput,
  options: { stateKeys?: string[], defaultMessage: string },
): string {
  const state = input.state as Record<string, unknown> | undefined
  for (const key of options.stateKeys ?? []) {
    const value = state?.[key]
    if (typeof value === 'string' && value.trim())
      return value.trim()
  }

  const messages = input.messages ?? []
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg?.role === 'user' && typeof msg.content === 'string' && msg.content.trim())
      return msg.content.trim()
  }

  return options.defaultMessage
}

export function buildMessagesInput(userText: string) {
  return { messages: [new HumanMessage(userText)] }
}
