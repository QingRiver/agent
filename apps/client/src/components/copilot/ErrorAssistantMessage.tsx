import type { CopilotChatAssistantMessageProps } from '@copilotkit/react-core/v2'
import { CopilotChatAssistantMessage, useCopilotChatConfiguration, useCopilotKit } from '@copilotkit/react-core/v2'
import { cn } from '@lib/utils'
import { AlertTriangle, ChevronDown, ChevronRight, ClipboardCopy, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { readErrorFields } from './errorMessage'

/**
 * 自定义 assistant message 渲染 slot:遇到 isError 消息渲染成对话流内的错误兜底卡片,
 * 否则透传默认 CopilotChatAssistantMessage。
 *
 * 卡片含:情绪安抚 + 行动指引文案 + 重新生成(取上一条 user 重发)+ 复制原问题 + 折叠技术详情。
 * 视觉淡红(非高饱和),隐藏赞踩/copy/朗读。
 */
export function ErrorAssistantMessage(props: CopilotChatAssistantMessageProps) {
  const { message, messages } = props
  const errorFields = readErrorFields(message)

  if (!errorFields) {
    // 非错误消息:透传默认渲染,保留原有行为
    return <CopilotChatAssistantMessage {...props} />
  }

  return (
    <ErrorCard
      messageId={message.id}
      messages={messages ?? []}
      content={typeof message.content === 'string' ? message.content : ''}
      code={errorFields.code}
      json={errorFields.json}
    />
  )
}

interface ErrorCardProps {
  messageId: string
  messages: NonNullable<CopilotChatAssistantMessageProps['messages']>
  content: string
  code: string
  json: string
}

function ErrorCard({ messageId, messages, content, code, json }: ErrorCardProps) {
  const { copilotkit } = useCopilotKit()
  const config = useCopilotChatConfiguration()
  const agentId = config?.agentId
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [retrying, setRetrying] = useState(false)

  // 上一条 user 消息(排除 isError 卡片自身)
  const lastUser = [...messages].reverse().find((m) => {
    return m.role === 'user' && readErrorFields(m) == null
  })
  const userText = typeof lastUser?.content === 'string' ? lastUser.content : ''

  async function handleRetry() {
    if (retrying || !lastUser || !agentId)
      return
    const agent = copilotkit.getAgent(agentId)
    if (!agent)
      return
    setRetrying(true)
    try {
      // 删错误卡片 + 上一条 user(重发会重新 addMessage)
      const userId = lastUser.id
      agent.setMessages(agent.messages.filter(m => m.id !== messageId && m.id !== userId))
      agent.addMessage({ id: crypto.randomUUID(), role: 'user', content: userText } as never)
      await copilotkit.runAgent({ agent })
    }
    finally {
      setRetrying(false)
    }
  }

  async function handleCopy() {
    if (!userText)
      return
    await navigator.clipboard.writeText(userText)
    setCopied(true)
    setTimeout(setCopied, 1500, false)
  }

  return (
    <div className="my-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
        <div className="min-w-0 flex-1">
          <div className="whitespace-pre-wrap break-words text-red-500">{content}</div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRetry}
              disabled={retrying || !lastUser}
              className="inline-flex items-center gap-1 rounded border border-red-400/50 px-2 py-1 text-xs text-red-500 transition hover:bg-red-500/20 disabled:opacity-50"
            >
              <RefreshCw className={cn('size-3', retrying && 'animate-spin')} />
              重新生成
            </button>
            <button
              type="button"
              onClick={handleCopy}
              disabled={!userText}
              className="inline-flex items-center gap-1 rounded border border-red-400/50 px-2 py-1 text-xs text-red-500 transition hover:bg-red-500/20 disabled:opacity-50"
            >
              <ClipboardCopy className="size-3" />
              {copied ? '已复制' : '复制原问题'}
            </button>
            {(code !== '' || json !== '') && (
              <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-red-400 transition hover:text-red-500"
              >
                {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                查看详情
              </button>
            )}
          </div>

          {expanded && (code !== '' || json !== '') && (
            <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-all rounded bg-black/20 p-2 text-[11px] leading-relaxed text-red-400">
              {code !== '' && (
                <div>
                  <span className="text-red-500/70">code</span>
                  :
                  {' '}
                  {code}
                </div>
              )}
              {json !== '' && (
                <div>
                  <span className="text-red-500/70">details</span>
                  :
                  {' '}
                  {json}
                </div>
              )}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
