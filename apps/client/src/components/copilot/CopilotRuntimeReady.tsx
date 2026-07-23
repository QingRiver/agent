import type { ReactNode } from 'react'
import { CopilotKitCoreRuntimeConnectionStatus, useCopilotKit } from '@copilotkit/react-core/v2'

interface CopilotRuntimeReadyProps {
  children: ReactNode
}

/**
 * useInterrupt / CopilotChat 依赖 runtime /info 同步后的稳定 agent 实例。
 * 在 Connecting 阶段 run 会落在 provisional agent 上，连接完成后 agent 被替换会导致
 * agent 被替换，导致进行中的 run / interrupt UI 错位。
 */
export function CopilotRuntimeReady({ children }: CopilotRuntimeReadyProps) {
  const { copilotkit } = useCopilotKit()

  if (!copilotkit.runtimeUrl)
    return <>{children}</>

  const status = copilotkit.runtimeConnectionStatus

  if (status === CopilotKitCoreRuntimeConnectionStatus.Connected)
    return <>{children}</>

  if (status === CopilotKitCoreRuntimeConnectionStatus.Error) {
    return (
      <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        无法连接 Copilot Runtime（请确认 server 已启动且
        {' '}
        <code className="rounded bg-muted px-1">/api/copilotkit</code>
        {' '}
        可访问）。
      </p>
    )
  }

  return (
    <p className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
      正在连接 Agent 运行时…
    </p>
  )
}
