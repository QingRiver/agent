import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { AgentId } from '../../lib/agentIds'
import {
  CopilotChat,
  CopilotKitProvider,
} from '@copilotkit/react-core/v2'
import { CopilotRuntimeReady } from './CopilotRuntimeReady'
import '@copilotkit/react-core/v2/styles.css'

function NoCopyButton(_props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return null
}

interface CopilotAgentShellProps {
  agentId: AgentId
  title: string
  description?: ReactNode
  children?: ReactNode
  /** 替换默认 CopilotChat */
  chat?: ReactNode
  /** 切换 agent 时传入以重置 CopilotChat 会话 */
  chatKey?: string
  chatClassName?: string
  placeholder?: string
}

export function CopilotAgentShell({
  agentId,
  title,
  description,
  children,
  chat,
  chatKey,
  chatClassName = 'h-full min-h-[24rem]',
  placeholder = '输入消息…',
}: CopilotAgentShellProps) {
  return (
    <CopilotKitProvider runtimeUrl="/api/copilotkit">
      <main className="mx-auto max-w-3xl p-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {description != null && (
            <p className="mt-2 text-sm text-slate-400">{description}</p>
          )}
          {children}
          <CopilotRuntimeReady>
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-800">
              {chat ?? (
                <CopilotChat
                  key={chatKey ?? agentId}
                  agentId={agentId}
                  className={chatClassName}
                  labels={{ chatInputPlaceholder: placeholder }}
                  messageView={{
                    assistantMessage: { copyButton: NoCopyButton },
                    userMessage: { copyButton: NoCopyButton },
                  }}
                />
              )}
            </div>
          </CopilotRuntimeReady>
        </div>
      </main>
    </CopilotKitProvider>
  )
}
