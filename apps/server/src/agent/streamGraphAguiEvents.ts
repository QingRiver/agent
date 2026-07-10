import type { BaseEvent, RunAgentInput } from '@ag-ui/core'
import type { AguiMappedEvent } from '@agent/graph'
import type { InterruptPayload, StreamChannel } from '@langchain/langgraph'
import { EventType } from '@ag-ui/core'
import {
  aguiRunContext,
  buildInterruptFinalizeEvents,
} from '@agent/graph'
import { getRequestContext } from '../context/requestContext'
import { ConversationService } from '../service/conversation'

export interface StreamGraphAguiOptions {
  resolveStreamInput: (input: RunAgentInput) => unknown
  resolveConfigurable?: (input: RunAgentInput) => Record<string, unknown>
}

/** 带 `aguiTransformerFactory` 编译的图，`streamEvents(v3)` 才有 `extensions.aguiEvents` */
export interface AguiTransformerGraphApp {
  streamEvents: (
    input: unknown,
    options: { version: 'v3', configurable?: Record<string, unknown> },
  ) => Promise<AguiTransformerGraphStream>
}

export interface AguiTransformerGraphStream extends AsyncIterable<unknown> {
  extensions: { aguiEvents: StreamChannel<AguiMappedEvent> }
  interrupted: boolean
  interrupts: readonly InterruptPayload[]
  output: Promise<Record<string, unknown>>
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
    const extraConfigurable = options.resolveConfigurable?.(input) ?? {}
    const stream = await graph.streamEvents(streamInput, {
      version: 'v3',
      configurable: { thread_id: threadId, ...extraConfigurable },
    })

    // drain 主迭代器驱动 transformer；stream 内部节点出错时该迭代器会 reject，
    // 捕获到 streamError 由主流程统一抛出，避免成为 unhandled rejection 崩溃进程
    let streamError: unknown
    const protocolDone = (async () => {
      try {
        for await (const _ of stream) { /* drain protocol to drive transformer */ }
      }
      catch (err) {
        streamError = err
      }
    })()

    for await (const event of stream.extensions.aguiEvents) {
      const ev = event as BaseEvent
      collected.push(ev)
      yield ev
    }

    await protocolDone
    if (streamError != null)
      throw streamError

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
        yield {
          type: EventType.RUN_FINISHED,
          threadId,
          runId,
          outcome: { type: 'success' },
        }
      }
    }
  }
  catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // stream 内部错误不会被 honoBridge 的 catch 捕获，必须在此打印，否则 server 终端无任何线索
    console.error(`[streamGraphAguiEvents] thread=${threadId} run=${runId} failed:`, err)
    // RUN_ERROR 已是 ag-ui 终态，不能再发 RUN_FINISHED（ag-ui client 会抛 AGUIError）
    if (!hasAnyRunFinished(collected)) {
      yield {
        type: EventType.RUN_ERROR,
        message,
      }
    }
  }
  finally {
    const ctx = getRequestContext()
    if (ctx)
      ConversationService.touch(ctx.userId, input.threadId)
    delete aguiRunContext.current
  }
}
