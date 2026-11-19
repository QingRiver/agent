import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import { Command } from '@langchain/langgraph'

/** 合并后的 editor 图入口分流：job=润色/⌘K；chat=Ask/Write 对话 */
export type EditorPath = 'job' | 'chat'

export type EditorEntryRoute = 'writeEdit' | 'classifyIntent'

export function readEditorPath(
  config: Pick<LangGraphRunnableConfig, 'configurable'> | { configurable?: Record<string, unknown> },
): EditorPath {
  return config.configurable?.editorPath === 'job' ? 'job' : 'chat'
}

/** START 后的入口节点：按 configurable.editorPath 用 Command 分流 */
export function routeEditorEntry(
  _state: unknown,
  config: LangGraphRunnableConfig,
): Command<unknown, Record<string, never>, EditorEntryRoute> {
  return new Command({
    goto: readEditorPath(config) === 'job' ? 'writeEdit' : 'classifyIntent',
  })
}

export const EDITOR_ENTRY_ENDS = ['writeEdit', 'classifyIntent'] as const satisfies readonly EditorEntryRoute[]
