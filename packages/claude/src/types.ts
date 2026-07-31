import type { Options, SDKMessage } from '@anthropic-ai/claude-agent-sdk'

export interface RunClaudeAgentParams {
  prompt: string
  options?: Options
  /** 逐条回调 SDK 流消息，便于日志或 UI 透传 */
  onMessage?: (message: SDKMessage) => void
}

export interface RunClaudeAgentResult {
  /** `subtype: 'success'` 时的最终文本 */
  result: string | undefined
  /** 所有 assistant 消息的 content 块 */
  assistantContents: unknown[]
  /** 完整原始消息流 */
  messages: SDKMessage[]
  sessionId: string | undefined
  error: string | undefined
}
