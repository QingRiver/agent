import type { GraphAgentCatalogItem, GraphsName } from '@apis/api-types'
import { Conversation } from '@apis/conversation-api'
import { Button } from '@components/ui/button'
import { useConversations } from '@hooks/useConversations'
import { cn } from '@lib/utils'
import { useEffect, useState } from 'react'

interface NewConversationDialogProps {
  open: boolean
  onClose: () => void
}

function NewConversationDialogBody({ onClose }: { onClose: () => void }) {
  const [graphs, setGraphs] = useState<GraphAgentCatalogItem[]>([])
  const [graphsName, setGraphsName] = useState<GraphsName | null>(null)
  const [loadingGraphs, setLoadingGraphs] = useState(true)
  const [graphsError, setGraphsError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const { create } = useConversations()

  useEffect(() => {
    let cancelled = false

    void Conversation.graphs()
      .then((items) => {
        if (cancelled)
          return
        setGraphs(items)
        setGraphsName(items[0]?.name ?? null)
      })
      .catch((err: unknown) => {
        if (cancelled)
          return
        setGraphs([])
        setGraphsName(null)
        setGraphsError(err instanceof Error ? err.message : '加载 Agent 列表失败')
      })
      .finally(() => {
        if (!cancelled)
          setLoadingGraphs(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
        <h2 className="text-lg font-semibold text-foreground">新建对话</h2>
        <p className="mt-1 text-sm text-muted-foreground">选择 Agent（创建后不可在本对话内切换）</p>

        {loadingGraphs && (
          <p className="mt-4 text-sm text-muted-foreground">加载 Agent 列表…</p>
        )}
        {graphsError != null && (
          <p className="mt-4 text-sm text-destructive">{graphsError}</p>
        )}
        {!loadingGraphs && graphsError == null && graphs.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">暂无可用 Agent</p>
        )}
        {!loadingGraphs && graphs.length > 0 && (
          <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto">
            {graphs.map(item => (
              <li key={item.name}>
                <button
                  type="button"
                  onClick={() => setGraphsName(item.name)}
                  className={cn(
                    'w-full rounded-lg border px-3 py-2 text-left transition-colors',
                    graphsName === item.name
                      ? 'border-border bg-accent text-accent-foreground'
                      : 'border-border bg-card text-foreground hover:border-border',
                  )}
                >
                  <div className="text-sm font-medium">{item.name}</div>
                  {item.description.trim() !== '' && (
                    <div className="mt-0.5 text-xs text-muted-foreground">{item.description}</div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            取消
          </Button>
          <Button
            type="button"
            disabled={pending || graphsName == null}
            onClick={async () => {
              if (graphsName == null)
                return
              setPending(true)
              try {
                await create(graphsName)
                onClose()
              }
              finally {
                setPending(false)
              }
            }}
          >
            创建
          </Button>
        </div>
      </div>
    </div>
  )
}

export function NewConversationDialog({ open, onClose }: NewConversationDialogProps) {
  if (!open)
    return null

  return <NewConversationDialogBody key="new-conversation" onClose={onClose} />
}
