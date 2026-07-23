import type { ConversationThread } from '@apis/api-types'
import { useConversations } from '@hooks/useConversations'
import { MessageSquarePlus } from 'lucide-react'
import { useState } from 'react'
import { ConversationListItem } from './ConversationListItem'
import { NewConversationDialog } from './NewConversationDialog'

export function ConversationSidebar() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const {
    conversations,
    activeId,
    isLoading,
    error,
    select,
    pin,
    unpin,
    remove,
  } = useConversations()

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-card">
      <div className="border-b border-border p-3">
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
        >
          <MessageSquarePlus className="size-4" />
          新建对话
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
    </aside>
  )
}
