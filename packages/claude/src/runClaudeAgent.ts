import type { RunClaudeAgentParams, RunClaudeAgentResult } from './types'
import { query } from './sdk'

/** 消费 Claude Agent SDK 流并汇总成功结果与 assistant 输出。 */
export async function runClaudeAgent(params: RunClaudeAgentParams): Promise<RunClaudeAgentResult> {
  const { prompt, options, onMessage } = params
  const stream = query(options ? { prompt, options } : { prompt })

  const messages: RunClaudeAgentResult['messages'] = []
  const assistantContents: unknown[] = []
  let result: string | undefined
  let sessionId: string | undefined
  let error: string | undefined

  for await (const message of stream) {
    onMessage?.(message)
    messages.push(message)

    if (message.type === 'assistant')
      assistantContents.push(message.message.content)

    if ('session_id' in message && typeof message.session_id === 'string')
      sessionId = message.session_id

    if (message.type === 'result') {
      if (message.subtype === 'success')
        result = message.result
      else
        error = message.errors?.join('\n') ?? message.subtype
    }
  }

  return { result, assistantContents, messages, sessionId, error }
}
