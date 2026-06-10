import type { AgUiMessage } from '@apis/api-types'
import type { AgentId } from '@lib/agentIds'
import {
  CopilotChat,
  CopilotChatConfigurationProvider,
  useAgent,
} from '@copilotkit/react-core/v2'
import { useEffect } from 'react'
import { CopilotRuntimeReady } from './CopilotRuntimeReady'

interface ConversationChatProps {
  agentId: AgentId
  threadId: string
  initialMessages: AgUiMessage[]
  chatClassName?: string
  placeholder?: string
  children?: React.ReactNode
}

export function ConversationChat({
  agentId,
  threadId,
  initialMessages,
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
        <ChatWithHydration
          agentId={agentId}
          threadId={threadId}
          initialMessages={initialMessages}
          chatClassName={chatClassName}
          placeholder={placeholder}
        />
        {children}
      </CopilotRuntimeReady>
    </CopilotChatConfigurationProvider>
  )
}

function ChatWithHydration({
  agentId,
  threadId,
  initialMessages,
  chatClassName,
  placeholder,
}: {
  agentId: AgentId
  threadId: string
  initialMessages: AgUiMessage[]
  chatClassName: string
  placeholder: string
}) {
  const { agent } = useAgent({ agentId })

  useEffect(() => {
    agent.threadId = threadId
    agent.messages = structuredClone(initialMessages) as typeof agent.messages
  }, [agent, agentId, threadId, initialMessages])

  return (
    <CopilotChat
      key={threadId}
      agentId={agentId}
      className={chatClassName}
      labels={{ chatInputPlaceholder: placeholder }}
    />
  )
}
