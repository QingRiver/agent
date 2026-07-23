import type { CopilotChatAssistantMessageProps } from '@copilotkit/react-core/v2'
import { ErrorAssistantMessage } from '@components/copilot/ErrorAssistantMessage'
import { isEditorChatInternalAssistantContent } from './editor-chat-message'

/** 编辑器对话：隐藏内部结构化输出，其余走错误兜底/默认气泡 */
export function EditorChatAssistantMessage(props: CopilotChatAssistantMessageProps) {
  const raw = props.message?.content
  const content = typeof raw === 'string' ? raw : ''
  if (isEditorChatInternalAssistantContent(content))
    return null
  return <ErrorAssistantMessage {...props} />
}
