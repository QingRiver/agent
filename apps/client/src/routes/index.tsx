import type { AgentId } from '@server/shared/conversation'
import { createFileRoute } from '@tanstack/react-router'
import { ConversationSidebar } from '../components/conversation/ConversationSidebar'
import { ConversationChat } from '../components/copilot/ConversationChat'
import { HitlInterruptUi } from '../components/hitl/HitlInterruptUi'
import { useConversations } from '../hooks/useConversations'
import { ChatLayout } from '../layouts/ChatLayout'
import { AGENT_IDS } from '../lib/agentIds'
import { getAguiAgent } from '../lib/aguiAgents'

export const Route = createFileRoute('/')({
  component: ChatPage,
})

function ChatPanel({
  threadId,
  agentId,
}: {
  threadId: string
  agentId: AgentId
}) {
  const agent = getAguiAgent(agentId)
  const { activeMessages, messagesLoading } = useConversations()

  if (messagesLoading || activeMessages == null) {
    return (
      <p className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-400">
        加载对话历史…
      </p>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-3 shrink-0">
        <h1 className="text-lg font-semibold text-slate-100">{agent.label}</h1>
        <p className="mt-1 text-sm text-slate-400">{agent.description}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-800">
        <ConversationChat
          agentId={agentId}
          threadId={threadId}
          initialMessages={activeMessages}
          chatClassName={agent.chatClassName ?? 'h-[calc(100vh-280px)] min-h-[20rem]'}
          placeholder={agent.placeholder}
        >
          {agent.agentId === AGENT_IDS.hitl && (
            <HitlInterruptUi threadId={threadId} />
          )}
        </ConversationChat>
      </div>
      {agent.renderExtras != null && (
        <div className="mt-3 shrink-0">{agent.renderExtras()}</div>
      )}
    </div>
  )
}

function ChatPage() {
  const conversations = useConversations()
  const { active, isLoading, error } = conversations

  return (
    <ChatLayout sidebar={<ConversationSidebar conversations={conversations} />}>
      {isLoading && (
        <p className="text-sm text-slate-400">加载对话列表…</p>
      )}
      {error != null && (
        <p className="text-sm text-red-400">{error}</p>
      )}
      {!isLoading && active != null && (
        <ChatPanel key={active.id} threadId={active.id} agentId={active.agentId} />
      )}
    </ChatLayout>
  )
}
