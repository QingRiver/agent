import type { ConversationThread } from '@apis/api-types'
import { Button } from '@components/ui/button'
import { useConversations } from '@hooks/useConversations'
import { MessageSquarePlus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { ConversationListItem } from './ConversationListItem'
import { NewConversationDialog } from './NewConversationDialog'

export function ConversationSidebar() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [confirmClearAll, setConfirmClearAll] = useState(false)
  const [clearing, setClearing] = useState(false)
  const {
    conversations,
    activeId,
    isLoading,
    error,
    select,
    pin,
    unpin,
    remove,
    removeAll,
  } = useConversations()

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex gap-1 border-b border-border p-3">
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
        >
          <MessageSquarePlus className="size-4 shrink-0" />
          新建对话
        </button>
        <button
          type="button"
          title="删除所有对话"
          disabled={isLoading || conversations.length === 0 || clearing}
          onClick={() => setConfirmClearAll(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
        >
          <Trash2 className="size-4" />
          清空
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Recent
        </div>
        {isLoading && (
          <p className="px-2 py-4 text-sm text-muted-foreground">加载中…</p>
        )}
        {error != null && (
          <p className="px-2 py-4 text-sm text-destructive">{error}</p>
        )}
        {!isLoading && !error && conversations.length === 0 && (
          <p className="px-2 py-4 text-sm text-muted-foreground">暂无对话</p>
        )}
        <div className="mt-1 space-y-0.5">
          {conversations.map((c: ConversationThread) => (
            <ConversationListItem
              key={c.id}
              conversation={c}
              selected={c.id === activeId}
              onSelect={() => select(c.id)}
              onPin={() => void pin(c.id)}
              onUnpin={() => void unpin(c.id)}
              onDelete={() => void remove(c.id)}
            />
          ))}
        </div>
      </div>

      <NewConversationDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />

      {confirmClearAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-4 shadow-xl">
            <p className="text-sm text-foreground">
              删除全部
              {' '}
              {conversations.length}
              {' '}
              条对话？关联的检查点与中断数据将一并清除，且不可恢复。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={clearing}
                onClick={() => setConfirmClearAll(false)}
              >
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-red-600 hover:bg-red-500"
                disabled={clearing}
                onClick={() => {
                  setClearing(true)
                  void removeAll()
                    .catch(() => {})
                    .finally(() => {
                      setClearing(false)
                      setConfirmClearAll(false)
                    })
                }}
              >
                {clearing ? '删除中…' : '全部删除'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
