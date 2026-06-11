import type { AgentId } from '@lib/agentIds'
import {
  CopilotChat,
  CopilotChatConfigurationProvider,
} from '@copilotkit/react-core/v2'
import { CopilotRuntimeReady } from './CopilotRuntimeReady'

interface ConversationChatProps {
  agentId: AgentId
  threadId: string
  chatClassName?: string
  placeholder?: string
  children?: React.ReactNode
}

/** 聊天历史由 CopilotChat connect → CheckpointConnectRunner MESSAGES_SNAPSHOT 恢复 */
export function ConversationChat({
  agentId,
  threadId,
  chatClassName = 'h-full min-h-[24rem]',
  placeholder = '输入消息…',
  children,
}: ConversationChatProps) {
  return (
    <CopilotChatConfigurationProvider
      agentId={agentId}
      threadId={threadId}
      hasExplicitThreadId
    >
      <CopilotRuntimeReady>
        <CopilotChat
          key={threadId}
          agentId={agentId}
          className={chatClassName}
          labels={{ chatInputPlaceholder: placeholder }}
        />
        {children}
      </CopilotRuntimeReady>
    </CopilotChatConfigurationProvider>
  )
}
