import type { GraphsName } from '@agent/graph'
import type {
  CopilotChatAssistantMessageProps,
  CopilotChatViewProps,
} from '@copilotkit/react-core/v2'
import type { AgentErrorInfo } from './AgentErrorBanner'
import { AgentInterruptUi } from '@components/hitl/AgentInterruptUi'
import {
  CopilotChat,
  CopilotChatConfigurationProvider,
  CopilotChatView,
  useAgent,
  useCopilotKit,
} from '@copilotkit/react-core/v2'
import { useLatest } from '@hooks/useLatest'
import { useMemo, useState } from 'react'
import { AgentDynamicUi } from './AgentDynamicUi'
import { AgentErrorBanner } from './AgentErrorBanner'
import { CopilotRuntimeReady } from './CopilotRuntimeReady'
import { ErrorAssistantMessage } from './ErrorAssistantMessage'
import { buildErrorMessage, readErrorFields } from './errorMessage'
import { kbForwardedProps } from './kbForwardedProps'

export type ShellErrorMode = 'message' | 'banner' | 'both'

export interface CopilotChatShellProps {
  agentId: GraphsName
  threadId: string
  /** 内建 AgentInterruptUi + pendingInterrupts → blockInput；默认关，避免误伤 editor */
  hitl?: boolean
  kbId?: string
  chatClassName?: string
  placeholder?: string
  /**
   * Chat 面错误展示：message=对话流卡片；banner=顶部条；both=两者。
   * writer 旁路仍用独立 AgentErrorBanner，不受此开关影响。
   */
  errorMode?: ShellErrorMode
  /**
   * 外部强制挡输入（如 editor 改写中）。
   * HITL 开启时与 pendingInterrupts 取或。
   */
  blockInput?: boolean
  blockInputHint?: string
  /**
   * 接管提交（含 suggestion）。提供时 Shell 不再 addMessage / runAgent，
   * 由调用方在自身 run 里带齐 state / forwardedProps。
   */
  onSubmitMessage?: (value: string) => void | Promise<void>
  assistantMessage?: (props: CopilotChatAssistantMessageProps) => React.ReactNode
  children?: React.ReactNode
}

interface ShellSubmitRefs {
  agentId: GraphsName
  kbId: string
  onSubmitMessage?: (value: string) => void | Promise<void>
}

function createErrorAssistantMessage(runForwardedProps?: Record<string, unknown>) {
  function BoundErrorAssistantMessage(props: CopilotChatAssistantMessageProps) {
    return <ErrorAssistantMessage {...props} runForwardedProps={runForwardedProps} />
  }
  return BoundErrorAssistantMessage
}

/**
 * CopilotChat v2 会用内置 onSubmitInput 盖掉 props.onSubmitMessage。
 * 经 chatView 覆写提交：默认路径在 runAgent 时直接带 forwardedProps；
 * 外部 onSubmitMessage 则完全接管（editor）。
 * Object.assign(..., CopilotChatView) 对齐 SlotValue 对 namespace 的要求。
 */
function createShellChatView(refs: { current: ShellSubmitRefs }) {
  function ShellChatView(props: CopilotChatViewProps) {
    const { agent } = useAgent({ agentId: refs.current.agentId })
    const { copilotkit } = useCopilotKit()

    async function runDefault(content: string) {
      const trimmed = content.trim()
      if (!trimmed || !agent)
        return
      const { agentId, kbId } = refs.current
      agent.addMessage({
        id: crypto.randomUUID(),
        role: 'user',
        content,
      } as never)
      const forwardedProps = kbForwardedProps(agentId, kbId)
      await copilotkit.runAgent({
        agent,
        ...(forwardedProps ? { forwardedProps } : {}),
      })
    }

    async function handleSubmit(value: string) {
      // CopilotChat 内置 onSubmitInput 会清输入；覆写后须自行清，否则输入框残留
      props.onInputChange?.('')
      const custom = refs.current.onSubmitMessage
      if (custom) {
        await custom(value)
        return
      }
      await runDefault(value)
    }

    return (
      <CopilotChatView
        {...props}
        onSubmitMessage={handleSubmit}
        onSelectSuggestion={async (suggestion) => {
          await handleSubmit(suggestion.message)
        }}
      />
    )
  }

  return Object.assign(ShellChatView, CopilotChatView)
}

/** 一次对话表面：Ready + Config + Chat + 可选 HITL。历史由 connect → CheckpointConnectRunner 恢复。 */
export function CopilotChatShell({
  agentId,
  threadId,
  hitl = false,
  kbId = 'kb_default',
  chatClassName = 'h-full min-h-[24rem]',
  placeholder = '输入消息…',
  errorMode = 'message',
  blockInput = false,
  blockInputHint = '请先完成上方的人机交互，再继续输入消息。',
  onSubmitMessage,
  assistantMessage,
  children,
}: CopilotChatShellProps) {
  const { agent } = useAgent({ agentId })
  const agentRef = useLatest(agent)
  const pendingBlock = hitl && agent.pendingInterrupts.length > 0
  const effectiveBlockInput = blockInput || pendingBlock
  const [bannerError, setBannerError] = useState<AgentErrorInfo | null>(null)

  const submitRefs = useLatest<ShellSubmitRefs>({ agentId, kbId, onSubmitMessage })
  const chatView = useMemo(() => createShellChatView(submitRefs), [submitRefs])
  const forwardedProps = useMemo(() => kbForwardedProps(agentId, kbId), [agentId, kbId])

  /** 默认错误卡片需带上 kb forwardedProps；自定义 slot 由调用方自行负责 */
  const resolvedAssistantMessage = useMemo(
    () => assistantMessage ?? createErrorAssistantMessage(forwardedProps),
    [assistantMessage, forwardedProps],
  )

  const showMessage = errorMode === 'message' || errorMode === 'both'
  const showBanner = errorMode === 'banner' || errorMode === 'both'

  return (
    <CopilotChatConfigurationProvider
      agentId={agentId}
      threadId={threadId}
      hasExplicitThreadId
    >
      <CopilotRuntimeReady>
        <div className="relative flex h-full min-h-0 flex-col">
          {hitl && (
            <AgentInterruptUi
              agentId={agentId}
              forwardedProps={forwardedProps}
            />
          )}
          <AgentDynamicUi agentId={agentId} />
          {showBanner && bannerError && (
            <div className="shrink-0 px-2 pt-2">
              <AgentErrorBanner
                error={bannerError}
                onDismiss={() => setBannerError(null)}
              />
            </div>
          )}
          <div className="relative min-h-0 flex-1">
            <CopilotChat
              key={threadId}
              agentId={agentId}
              className={chatClassName}
              labels={{ chatInputPlaceholder: placeholder }}
              chatView={chatView}
              messageView={{
                // 自定义 assistant slot:isError 消息渲染成对话流内错误卡片,否则透传默认。
                // slot 类型要求 CopilotChatAssistantMessage 的 namespace(Toolbar/CopyButton 等),
                // ErrorAssistantMessage 是分支透传组件无 namespace,as never 对齐 slot 类型
                assistantMessage: resolvedAssistantMessage as never,
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
                const info: AgentErrorInfo = {
                  message: error?.message ?? '发生错误',
                  code: str('code') || code,
                  name: str('name'),
                  json: str('json'),
                }
                if (showBanner)
                  setBannerError(info)

                if (!showMessage)
                  return

                const ag = agentRef.current
                if (!ag)
                  return

                // 去重:末尾已是 isError 错误卡片时跳过(避免 CopilotKit 重复触发 onError 叠加多张)。
                const lastAssistant = [...ag.messages].reverse().find(m => m.role === 'assistant')
                if (readErrorFields(lastAssistant) != null)
                  return

                ag.addMessage(buildErrorMessage(
                  info.message,
                  { code: info.code, name: info.name, json: info.json },
                ) as never)
              }}
            />
            {effectiveBlockInput && (
              <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-10 border-t border-amber-700/50 bg-card px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
                {blockInputHint}
              </div>
            )}
          </div>
        </div>
        {children}
      </CopilotRuntimeReady>
    </CopilotChatConfigurationProvider>
  )
}
