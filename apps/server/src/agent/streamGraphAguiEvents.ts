import type { BaseEvent, RunAgentInput } from '@ag-ui/core'
import type { AguiMappedEvent } from '@agent/graph'
import type { InterruptPayload, StreamChannel } from '@langchain/langgraph'
import { EventType } from '@ag-ui/core'
import {
  aguiRunContext,
  buildInterruptFinalizeEvents,
} from '@agent/graph'
import { mirrorConversationMessages } from '../conversation/messageMirror'

export interface StreamGraphAguiOptions {
  resolveStreamInput: (input: RunAgentInput) => unknown
  formatSummary?: (values: Record<string, unknown>) => string | undefined
}

/** 带 `aguiTransformerFactory` 编译的图，`streamEvents(v3)` 才有 `extensions.aguiEvents` */
export interface AguiTransformerGraphApp {
  streamEvents: (
    input: unknown,
    options: { version: 'v3', configurable?: { thread_id: string } },
  ) => Promise<AguiTransformerGraphStream>
}

export interface AguiTransformerGraphStream extends AsyncIterable<unknown> {
  extensions: { aguiEvents: StreamChannel<AguiMappedEvent> }
  interrupted: boolean
  interrupts: readonly InterruptPayload[]
  output: Promise<Record<string, unknown>>
}

function isInterruptRunFinished(e: BaseEvent): boolean {
  return e.type === EventType.RUN_FINISHED
    && 'outcome' in e
    && (e as { outcome?: { type?: string } }).outcome?.type === 'interrupt'
}

function hasInterruptRunFinished(events: readonly BaseEvent[]): boolean {
  return events.some(isInterruptRunFinished)
}

function hasAnyRunFinished(events: readonly BaseEvent[]): boolean {
  return events.some(e => e.type === EventType.RUN_FINISHED)
}

export async function* streamGraphAguiEvents(
  input: RunAgentInput,
  graph: AguiTransformerGraphApp,
  options: StreamGraphAguiOptions,
): AsyncGenerator<BaseEvent> {
  const { threadId, runId } = input

  yield {
    type: EventType.RUN_STARTED,
    threadId,
    runId,
    input,
  }

  const collected: BaseEvent[] = []

  try {
    aguiRunContext.current = { threadId, runId }

    const streamInput = options.resolveStreamInput(input)
    const stream = await graph.streamEvents(streamInput, {
      version: 'v3',
      configurable: { thread_id: threadId },
    })

    const protocolDone = (async () => {
      for await (const _ of stream) { /* drain protocol to drive transformer */ }
    })()

    for await (const event of stream.extensions.aguiEvents) {
      const ev = event as BaseEvent
      collected.push(ev)
      yield ev
    }

    await protocolDone

    if (!hasAnyRunFinished(collected)) {
      if (stream.interrupted && stream.interrupts.length > 0) {
        const snapshot = await stream.output
        for (const ev of buildInterruptFinalizeEvents({
          threadId,
          runId,
          interrupts: stream.interrupts,
          snapshot: snapshot as Record<string, unknown>,
        })) {
          collected.push(ev)
          yield ev
        }
      }
      else {
        const values = await stream.output
        if (options.formatSummary) {
          const summary = options.formatSummary(values as Record<string, unknown>)
          if (summary) {
            const messageId = crypto.randomUUID()
            yield { type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' }
            yield { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: summary }
            yield { type: EventType.TEXT_MESSAGE_END, messageId }
          }
        }
        yield {
          type: EventType.RUN_FINISHED,
          threadId,
          runId,
          outcome: { type: 'success' },
        }
      }
    }
    else if (
      !hasInterruptRunFinished(collected)
      && !stream.interrupted
      && options.formatSummary
    ) {
      const values = await stream.output
      const summary = options.formatSummary(values as Record<string, unknown>)
      if (summary) {
        const messageId = crypto.randomUUID()
        yield { type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' }
        yield { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: summary }
        yield { type: EventType.TEXT_MESSAGE_END, messageId }
      }
    }
  }
  catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    yield {
      type: EventType.RUN_ERROR,
      message,
    }
    yield {
      type: EventType.RUN_FINISHED,
      threadId,
      runId,
    }
  }
  finally {
    mirrorConversationMessages(input, collected)
    delete aguiRunContext.current
  }
}
