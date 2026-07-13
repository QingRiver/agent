import type {
  BaseEvent,
  Message,
  RunAgentInput,
} from '@ag-ui/core'
import type { PendingInterrupt } from '../../shared/conversation'
import { randomUUID } from 'node:crypto'
import { EventType } from '@ag-ui/core'
import { InMemoryAgentRunner } from '@copilotkit/runtime/v2'
import { Observable } from 'rxjs'
import { getRequestContext } from '../context/requestContext'
import { buildPendingInterruptConnectEvents } from '../conversation/pendingInterruptAgUi'
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

function buildCheckpointReplayRun(
  threadId: string,
  messages: Message[],
  pendingInterrupt: PendingInterrupt | null,
): BaseEvent[] {
  const runId = `connect-replay-${randomUUID()}`
  const input: RunAgentInput = {
    threadId,
    runId,
    messages,
    tools: [],
    context: [],
  }

  const base: BaseEvent[] = [
    {
      type: EventType.RUN_STARTED,
      threadId,
      runId,
      input,
    },
    {
      type: EventType.MESSAGES_SNAPSHOT,
      messages,
    },
  ]

  if (pendingInterrupt != null) {
    base.push(...buildPendingInterruptConnectEvents(threadId, runId, pendingInterrupt))
    return base
  }

  base.push({
    type: EventType.RUN_FINISHED,
    threadId,
    runId,
    outcome: { type: 'success' },
  })
  return base
}

async function buildCheckpointConnectEvents(threadId: string): Promise<BaseEvent[]> {
  const ctx = getRequestContext()
  if (!ctx)
    return []

  const conversation = await ConversationService.get(ctx.userId, threadId)
  if (!conversation)
    return []

  try {
    const bundle = await hydrateThreadBundle(conversation.agentId, threadId)
    const pending = bundle.threadState.pendingInterrupt
    if (bundle.messages.length === 0 && pending == null)
      return []

    return buildCheckpointReplayRun(threadId, bundle.messages, pending)
  }
  catch {
    return []
  }
}
