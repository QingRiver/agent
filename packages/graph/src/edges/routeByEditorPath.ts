import type { LangGraphRunnableConfig } from '@langchain/langgraph'

/** 合并后的 editor 图入口分流：job=润色/⌘K；chat=Ask/Write 对话 */
export type EditorPath = 'job' | 'chat'

export function readEditorPath(
  config: Pick<LangGraphRunnableConfig, 'configurable'> | { configurable?: Record<string, unknown> },
): EditorPath {
  return config.configurable?.editorPath === 'job' ? 'job' : 'chat'
}

/** START → writeEdit | classifyIntent */
export function routeByEditorPath(
  _state: unknown,
  config: LangGraphRunnableConfig,
): 'writeEdit' | 'classifyIntent' {
  return readEditorPath(config) === 'job' ? 'writeEdit' : 'classifyIntent'
}
