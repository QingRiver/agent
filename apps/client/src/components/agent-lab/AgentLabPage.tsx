import type { ReactAgentLabConfig } from './agentLabConfig'
import { Conversation } from '@apis/conversation-api'
import { ConversationChat } from '@components/copilot/ConversationChat'
import { AgentInterruptUi } from '@components/hitl/AgentInterruptUi'
import { useAgentHasPendingInterrupt } from '@components/hitl/useAgentHasPendingInterrupt'
import { useCallback, useEffect, useState } from 'react'
import { loadAgentLabConfig } from './agentLabConfig'
import { AgentLabConfigPanel } from './AgentLabConfigPanel'
import { AgentLabStateBridge } from './AgentLabStateBridge'

function AgentLabChatPanel({
  threadId,
  config,
}: {
  threadId: string
  config: ReactAgentLabConfig
}) {
  const hasPendingInterrupt = useAgentHasPendingInterrupt('reactAgent')

  return (
    <div className="flex h-full min-h-0 flex-col p-4">
      <div className="mb-2 shrink-0">
        <h2 className="text-base font-semibold text-foreground">
          {config.name || 'reactAgent'}
        </h2>
        <p className="text-xs text-muted-foreground">
          {config.description || '通用 ReAct 试验台'}
          {' · '}
          thread
          {' '}
          {threadId.slice(0, 8)}
          …
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border">
        <ConversationChat
          graphsName="reactAgent"
          threadId={threadId}
          kbId={config.kbId}
          blockInput={hasPendingInterrupt}
        >
          <AgentLabStateBridge config={config} />
          <AgentInterruptUi agentId="reactAgent" threadId={threadId} />
        </ConversationChat>
      </div>
    </div>
  )
}

export function AgentLabPage() {
  const [config, setConfig] = useState<ReactAgentLabConfig>(() => loadAgentLabConfig())
  const [threadId, setThreadId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createThread = useCallback(async () => {
    setCreating(true)
    setError(null)
    try {
      const conversation = await Conversation.create('reactAgent')
      setThreadId(conversation.id)
    }
    catch (err) {
      setError(err instanceof Error ? err.message : '创建测试线程失败')
    }
    finally {
      setCreating(false)
    }
  }, [])

  useEffect(() => {
    void createThread()
  }, [createThread])

  return (
    <div className="mx-auto flex h-[calc(100vh-5rem)] max-w-7xl gap-0 border-x border-border">
      <aside className="w-full max-w-md shrink-0 border-r border-border bg-card">
        <AgentLabConfigPanel
          config={config}
          onChange={setConfig}
          onNewThread={() => void createThread()}
          creatingThread={creating}
        />
      </aside>
      <main className="min-w-0 flex-1 bg-muted/30">
        {error != null && (
          <p className="p-4 text-sm text-destructive">{error}</p>
        )}
        {threadId == null && error == null && (
          <p className="p-4 text-sm text-muted-foreground">正在创建测试线程…</p>
        )}
        {threadId != null && (
          <AgentLabChatPanel
            key={threadId}
            threadId={threadId}
            config={config}
          />
        )}
      </main>
    </div>
  )
}
