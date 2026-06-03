/** 与 @ag-ui/langgraph LangGraphEventTypes 对齐（仅保留当前映射用到的项；不映射 on_chain_*） */
export const LangGraphEventTypes = {
  OnChatModelStream: 'on_chat_model_stream',
  OnChatModelEnd: 'on_chat_model_end',
  OnToolEnd: 'on_tool_end',
} as const
