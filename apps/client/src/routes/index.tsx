import type { GraphsName } from '@apis/api-types'
import { ConversationSidebar } from '@components/conversation/ConversationSidebar'
import { CopilotChatShell } from '@components/copilot/CopilotChatShell'
import { useConversations } from '@hooks/useConversations'
import { ChatLayout } from '@layouts/ChatLayout'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: ChatPage,
})

function ChatPanel({
  threadId,
  graphsName,
}: {
  threadId: string
  graphsName: GraphsName
}) {
  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-border bg-muted p-4">
      <div className="mb-3 shrink-0">
        <h1 className="text-lg font-semibold text-foreground">{graphsName}</h1>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border">
        <CopilotChatShell
          agentId={graphsName}
          threadId={threadId}
          hitl
        />
      </div>
    </div>
  )
}

function ChatPage() {
  const { active, isLoading, error } = useConversations()

  return (
    <ChatLayout sidebar={<ConversationSidebar />}>
      {isLoading && (
        <p className="text-sm text-muted-foreground">加载对话列表…</p>
      )}
      {error != null && (
        <p className="text-sm text-destructive">{error}</p>
      )}
      {!isLoading && active != null && (
        <ChatPanel key={active.id} threadId={active.id} graphsName={active.agentId} />
      )}
    </ChatLayout>
  )
}
