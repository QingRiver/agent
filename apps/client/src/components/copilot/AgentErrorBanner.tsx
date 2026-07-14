import { Alert, AlertTitle } from '@components/ui/alert'
import { cn } from '@lib/utils'
import { ChevronDown, ChevronRight, X } from 'lucide-react'
import { useState } from 'react'

/** 后端 serializeAgentError 产出的结构化错误（经 RUN_ERROR 事件扩展字段透传到前端） */
export interface AgentErrorInfo {
  /** 友好标题（RUN_ERROR 标准 message） */
  message: string
  /** 错误码（如 KB_INFRA_DOWN / AGENT_LOCAL） */
  code: string
  /** Error.name */
  name: string
  /** 完整详情的 pretty JSON 字符串（hint/cause/stack/agentId/threadId/runId） */
  json: string
}

interface AgentErrorBannerProps {
  error: AgentErrorInfo
  onDismiss: () => void
  className?: string
}

/** 聊天内联错误条：友好标题 + 可展开详情（code / name / json）。 */
export function AgentErrorBanner({ error, onDismiss, className }: AgentErrorBannerProps) {
  const [expanded, setExpanded] = useState(false)

  const hasDetails = error.code !== '' || error.name !== '' || error.json !== ''

  return (
    <Alert variant="destructive" className={cn('relative gap-1.5 py-2.5', className)}>
      <X
        className="absolute right-2 top-2 size-4 cursor-pointer opacity-50 hover:opacity-100"
        onClick={onDismiss}
      />
      <AlertTitle className="flex items-center gap-1.5 pr-6 text-destructive">
        <span>
          ⚠️
          {error.message}
        </span>
      </AlertTitle>
      {hasDetails && (
        <div className="mt-1">
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            {expanded ? '隐藏详情' : '查看详情'}
          </button>
          {expanded && (
            <pre className="mt-1.5 max-h-52 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/40 p-2 text-[11px] leading-relaxed text-muted-foreground">
              {error.code && (
                <div>
                  <span className="text-foreground/70">code</span>
                  :
                  {' '}
                  {error.code}
                </div>
              )}
              {error.name && (
                <div>
                  <span className="text-foreground/70">name</span>
                  :
                  {' '}
                  {error.name}
                </div>
              )}
              {error.json && (
                <div>
                  <span className="text-foreground/70">details</span>
                  :
                  {' '}
                  {error.json}
                </div>
              )}
            </pre>
          )}
        </div>
      )}
    </Alert>
  )
}
