import type { UseConversationsResult } from '../../hooks/useConversations'
import type { ConversationThread } from '../../lib/api-types'
import { MessageSquarePlus } from 'lucide-react'
import { useState } from 'react'
import { ConversationListItem } from './ConversationListItem'
import { NewConversationDialog } from './NewConversationDialog'

interface ConversationSidebarProps {
  conversations: UseConversationsResult
}

export function ConversationSidebar({ conversations }: ConversationSidebarProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const { activeId, isLoading, error, conversations: list } = conversations

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-950/80">
      <div className="border-b border-slate-800 p-3">
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
        >
          <MessageSquarePlus className="size-4" />
          新建对话
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-slate-500">
          Recent
        </div>
        {isLoading && (
          <p className="px-2 py-4 text-sm text-slate-500">加载中…</p>
        )}
        {error != null && (
          <p className="px-2 py-4 text-sm text-red-400">{error}</p>
        )}
        {!isLoading && !error && list.length === 0 && (
          <p className="px-2 py-4 text-sm text-slate-500">暂无对话</p>
        )}
        <div className="mt-1 space-y-0.5">
          {list.map((c: ConversationThread) => (
            <ConversationListItem
              key={c.id}
              conversation={c}
              selected={c.id === activeId}
              onSelect={() => conversations.select(c.id)}
              onPin={() => void conversations.pin(c.id)}
              onUnpin={() => void conversations.unpin(c.id)}
              onDelete={() => void conversations.remove(c.id)}
            />
          ))}
        </div>
      </div>

      <NewConversationDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreate={conversations.create}
      />
    </aside>
  )
}
