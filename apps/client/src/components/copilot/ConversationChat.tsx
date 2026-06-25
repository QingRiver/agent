import type { GraphsName } from '@agent/graph'
import {
  CopilotChat,
  CopilotChatConfigurationProvider,
} from '@copilotkit/react-core/v2'
import { CopilotRuntimeReady } from './CopilotRuntimeReady'

interface ConversationChatProps {
  graphsName: GraphsName
  threadId: string
  chatClassName?: string
  placeholder?: string
  /** HITL 挂起时禁用输入，避免 CopilotKit 因未 resume 而拒绝新 run */
  blockInput?: boolean
  blockInputHint?: string
  children?: React.ReactNode
}

/** 聊天历史由 CopilotChat connect → CheckpointConnectRunner MESSAGES_SNAPSHOT 恢复 */
export function ConversationChat({
  graphsName,
  threadId,
  chatClassName = 'h-full min-h-[24rem]',
  placeholder = '输入消息…',
  blockInput = false,
  blockInputHint = '请先完成上方的人机交互，再继续输入消息。',
  children,
}: ConversationChatProps) {
  return (
    <CopilotChatConfigurationProvider
      agentId={graphsName}
      threadId={threadId}
      hasExplicitThreadId
    >
      <CopilotRuntimeReady>
        <div className="relative h-full min-h-0">
          <CopilotChat
            key={threadId}
            agentId={graphsName}
            className={chatClassName}
            labels={{ chatInputPlaceholder: placeholder }}
          />
          {blockInput && (
            <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-10 border-t border-amber-700/50 bg-slate-900/95 px-3 py-2 text-sm text-amber-200">
              {blockInputHint}
            </div>
          )}
        </div>
        {children}
      </CopilotRuntimeReady>
    </CopilotChatConfigurationProvider>
  )
}
