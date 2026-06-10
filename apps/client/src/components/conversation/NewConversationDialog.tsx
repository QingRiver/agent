import type { AgentId } from '@apis/api-types'
import { Button } from '@components/ui/button'
import { useConversations } from '@hooks/useConversations'
import { AGUI_AGENTS } from '@lib/aguiAgents'
import { useState } from 'react'

interface NewConversationDialogProps {
  open: boolean
  onClose: () => void
}

export function NewConversationDialog({ open, onClose }: NewConversationDialogProps) {
  const [agentId, setAgentId] = useState<AgentId>(AGUI_AGENTS[0]!.agentId)
  const [pending, setPending] = useState(false)
  const { create } = useConversations()

  if (!open)
    return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-100">新建对话</h2>
        <p className="mt-1 text-sm text-slate-400">选择 Agent 类型（创建后不可在本对话内切换）</p>
        <label className="mt-4 block text-sm text-slate-300">
          Agent
          <select
            value={agentId}
            onChange={e => setAgentId(e.target.value as AgentId)}
            className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          >
            {AGUI_AGENTS.map(item => (
              <option key={item.agentId} value={item.agentId}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            取消
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={async () => {
              setPending(true)
              try {
                await create(agentId)
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
