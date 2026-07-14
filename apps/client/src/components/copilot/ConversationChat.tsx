import type { GraphsName } from '@agent/graph'
import {
  CopilotChat,
  CopilotChatConfigurationProvider,
  useAgent,
} from '@copilotkit/react-core/v2'
import { useRef } from 'react'
import { CopilotRuntimeReady } from './CopilotRuntimeReady'
import { ErrorAssistantMessage } from './ErrorAssistantMessage'
import { buildErrorMessage, readErrorFields } from './errorMessage'
import { KbAgentState } from './KbAgentState'

interface ConversationChatProps {
  graphsName: GraphsName
  threadId: string
  kbId?: string
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
  kbId = 'kb_default',
  chatClassName = 'h-full min-h-[24rem]',
  placeholder = '输入消息…',
  blockInput = false,
  blockInputHint = '请先完成上方的人机交互，再继续输入消息。',
  children,
}: ConversationChatProps) {
  const { agent } = useAgent({ agentId: graphsName })
  const agentRef = useRef(agent)
  agentRef.current = agent

  // threadId 切换时父级 ChatPanel key={active.id} 会重挂本组件,错误 state 自然重置,无需 effect 清空

  return (
    <CopilotChatConfigurationProvider
      agentId={graphsName}
      threadId={threadId}
      hasExplicitThreadId
    >
      <CopilotRuntimeReady>
        <div className="relative h-full min-h-0">
          {graphsName === 'kb' && <KbAgentState kbId={kbId} />}
          <CopilotChat
            key={threadId}
            agentId={graphsName}
            className={chatClassName}
            labels={{ chatInputPlaceholder: placeholder }}
            messageView={{
              // 自定义 assistant slot:isError 消息渲染成对话流内错误卡片,否则透传默认。
              // slot 类型要求 CopilotChatAssistantMessage 的 namespace(Toolbar/CopyButton 等),
              // ErrorAssistantMessage 是分支透传组件无 namespace,as never 对齐 slot 类型
              assistantMessage: ErrorAssistantMessage as never,
              userMessage: { copyButton: () => null },
            }}
            onError={(raw) => {
              // CopilotChat 的 onError 签名是 (event: { error, code, context }) => void，
              // 但 prop 类型与 DOM onError 重载成联合，此处收窄。RUN_ERROR 扩展字段挂在 context.event 上。
              const { error, code, context } = raw as {
                error: Error
                code: string
                context: Record<string, unknown>
              }
              const ev = context?.event as Record<string, unknown> | undefined
              const str = (k: string): string => {
                const v = ev?.[k]
                return typeof v === 'string' ? v : ''
              }
              const ag = agentRef.current
              if (!ag)
                return

              // 去重:末尾已是 isError 错误卡片时跳过(避免 CopilotKit 重复触发 onError 叠加多张)。
              // 不按 lastAssistant.content 判断——历史对话的 assistant 回复也有 content,会误判跳过注入。
              // 流式中断(本次 LLM 吐到一半报错)场景:半截 assistant 后跟错误卡片,可接受(留后续优化为分割线追加)。
              const lastAssistant = [...ag.messages].reverse().find(m => m.role === 'assistant')
              if (readErrorFields(lastAssistant) != null)
                return

              // 注入错误兜底消息到对话流;addMessage 接受 ag-ui Message 联合,
              // 本地 ErrorAssistantMessageData 带扩展字段(isError/code/json,运行时保留),as never 一次
              ag.addMessage(buildErrorMessage(
                error?.message ?? '发生错误',
                { code: str('code') || code, name: str('name'), json: str('json') },
              ) as never)
            }}
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
