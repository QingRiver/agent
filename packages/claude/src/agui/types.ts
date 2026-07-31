export interface ClaudeAguiMapState {
  activeMessageId: string | null
  partialStreaming: boolean
  /** content block index → text message id */
  textBlocks: Map<number, string>
  /** content block index → in-flight tool call */
  toolBlocks: Map<number, {
    toolCallId: string
    name: string
    ended: boolean
    /** 是否已发过 TOOL_CALL_ARGS（流式 delta 或整块 input） */
    argsSent: boolean
    pendingInput: unknown
  }>
}

export function createClaudeAguiMapState(): ClaudeAguiMapState {
  return {
    activeMessageId: null,
    partialStreaming: false,
    textBlocks: new Map(),
    toolBlocks: new Map(),
  }
}
