import type { ConversationThread } from '@apis/api-types'
import { Button } from '@components/ui/button'
import { getAguiAgent } from '@lib/aguiAgents'
import { cn } from '@lib/utils'
import { Pin, PinOff, Trash2 } from 'lucide-react'
import { useState } from 'react'

interface ConversationListItemProps {
  conversation: ConversationThread
  selected: boolean
  onSelect: () => void
  onPin: () => void
  onUnpin: () => void
  onDelete: () => void
}

export function ConversationListItem({
  conversation,
  selected,
  onSelect,
  onPin,
  onUnpin,
  onDelete,
}: ConversationListItemProps) {
  const agentLabel = getAguiAgent(conversation.agentId).label
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div
      className={cn(
        'group flex items-start gap-1 rounded-lg px-2 py-2 text-sm transition-colors',
        selected
          ? 'bg-slate-800 text-slate-100'
          : 'text-slate-300 hover:bg-slate-800/60',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 text-left"
      >
        <div className="truncate font-medium">{conversation.title}</div>
        <div className="mt-0.5 truncate text-xs text-slate-500">{agentLabel}</div>
      </button>
      <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          title={conversation.pinned ? '取消置顶' : '置顶'}
          onClick={(e) => {
            e.stopPropagation()
            if (conversation.pinned)
              onUnpin()
            else
              onPin()
          }}
          className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
        >
          {conversation.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
        </button>
        <button
          type="button"
          title="删除"
          onClick={(e) => {
            e.stopPropagation()
            setConfirmDelete(true)
          }}
          className="rounded p-1 text-slate-400 hover:bg-red-900/50 hover:text-red-300"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-xl">
            <p className="text-sm text-slate-200">
              删除「
              {conversation.title}
              」？关联的检查点数据将一并清除。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-red-600 hover:bg-red-500"
                onClick={() => {
                  setConfirmDelete(false)
                  onDelete()
                }}
              >
                删除
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
