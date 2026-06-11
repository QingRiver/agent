import type {
  AssistantMessage,
  BaseEvent,
  Message,
  RunAgentInput,
  ToolCall,
  ToolMessage,
  UserMessage,
} from '@ag-ui/core'
import type { AgUiMessage } from '../../shared/conversation'
import { randomUUID } from 'node:crypto'
import { EventType } from '@ag-ui/core'
import { InMemoryAgentRunner } from '@copilotkit/runtime/v2'
import { Observable } from 'rxjs'
import { getRequestContext } from '../context/requestContext'
import { hydrateThreadBundle } from '../conversation/threadHydrate'
import { ConversationService } from '../service/conversation'

/**
 * CopilotKit `connect` 默认只 replay 进程内 InMemory 事件；checkpoint 线程在重启后为空，
 * 客户端 connectAgent 又会先 `setMessages([])`，导致历史闪一下后消失。
 * 内存无 replay 时，从 LangGraph checkpoint 补发完整 AG-UI run 序列
 * （`RUN_STARTED` → `MESSAGES_SNAPSHOT` → `RUN_FINISHED`）。
 */
export class CheckpointConnectRunner extends InMemoryAgentRunner {
  override connect(
    request: Parameters<InMemoryAgentRunner['connect']>[0],
  ): ReturnType<InMemoryAgentRunner['connect']> {
    const memoryReplay = super.connect(request)

    return new Observable<BaseEvent>((subscriber) => {
      let hasEvents = false
      const sub = memoryReplay.subscribe({
        next: (event) => {
          hasEvents = true
          subscriber.next(event)
        },
        error: err => subscriber.error(err),
        complete: () => {
          void (async () => {
            if (!hasEvents) {
              for (const event of await buildCheckpointConnectEvents(request.threadId))
                subscriber.next(event)
            }
            subscriber.complete()
          })()
        },
      })
      return () => sub.unsubscribe()
    })
  }
}

function toAssistantSnapshotMessage(msg: AgUiMessage): AssistantMessage {
  const snapshot: AssistantMessage = {
    id: String(msg.id),
    role: 'assistant',
    content: String(msg.content ?? ''),
  }

  if (Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0)
    snapshot.toolCalls = msg.toolCalls as ToolCall[]

  return snapshot
}

function toAgUiSnapshotMessages(messages: AgUiMessage[]): Message[] {
  const snapshots: Message[] = []

  for (const msg of messages) {
    const id = String(msg.id)
    const content = String(msg.content ?? '')

    switch (msg.role) {
      case 'assistant':
        snapshots.push(toAssistantSnapshotMessage(msg))
        break
      case 'tool': {
        const toolCallId = typeof msg.toolCallId === 'string' ? msg.toolCallId : ''
        if (!toolCallId)
          break
        const toolMessage: ToolMessage = {
          id,
          role: 'tool',
          content,
          toolCallId,
        }
        snapshots.push(toolMessage)
        break
      }
      case 'user': {
        const userMessage: UserMessage = {
          id,
          role: 'user',
          content,
        }
        snapshots.push(userMessage)
        break
      }
      default:
        snapshots.push({
          id,
          role: String(msg.role),
          content,
        } as Message)
    }
  }

  return snapshots
}

function buildCheckpointReplayRun(threadId: string, messages: AgUiMessage[]): BaseEvent[] {
  const runId = `connect-replay-${randomUUID()}`
  const snapshotMessages = toAgUiSnapshotMessages(messages)
  const input: RunAgentInput = {
    threadId,
    runId,
    messages: snapshotMessages,
    tools: [],
    context: [],
  }

  return [
    {
      type: EventType.RUN_STARTED,
      threadId,
      runId,
      input,
    },
    {
      type: EventType.MESSAGES_SNAPSHOT,
      messages: snapshotMessages,
    },
    {
      type: EventType.RUN_FINISHED,
      threadId,
      runId,
      outcome: { type: 'success' },
    },
  ]
}

async function buildCheckpointConnectEvents(threadId: string): Promise<BaseEvent[]> {
  const ctx = getRequestContext()
  if (ctx.mode !== 'auth' || !ctx.userId)
    return []

  const conversation = ConversationService.get(ctx.userId, threadId)
  if (!conversation)
    return []

  try {
    const bundle = await hydrateThreadBundle(conversation.agentId, threadId)
    if (bundle.messages.length === 0)
      return []

    return buildCheckpointReplayRun(threadId, bundle.messages)
  }
  catch {
    return []
  }
}
