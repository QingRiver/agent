import type { BaseEvent, RunAgentInput } from '@ag-ui/core'
import type { CompiledStateGraph } from '@langchain/langgraph'
import type { Observable } from 'rxjs'
import type { GraphAguiStreamOptions } from '../runGraphAsAguiStream'
import type { StreamMapContext } from './messagesInProgress'
import { EventType } from '@ag-ui/core'
import { Command } from '@langchain/langgraph'
import { concat, defer, from, of } from 'rxjs'
import { concatMap } from 'rxjs/operators'
import { emitInterruptAgUiEvents } from '../interrupt/emitInterrupt'
import { getFirstActiveInterrupt, graphConfigFromThreadId } from '../langGraphInterrupt'
import {
  emitSummaryTextEvents,
  mapLangGraphEventToAgUi,
} from '../map/langGraphEventToAgUi'
import { sanitizeForAgui } from '../sanitize'
import { fromLangGraphEvents } from '../stream/fromLangGraphEvents'
import { createStreamMapContext } from './messagesInProgress'

async function finalizeRunEvents(
  graph: CompiledStateGraph<any, any, any>,
  config: { configurable: { thread_id: string } },
  input: { threadId: string, runId: string },
  options: GraphAguiStreamOptions,
): Promise<BaseEvent[]> {
  const events: BaseEvent[] = []
  const graphState = await graph.getState(config)
  const values = (graphState.values ?? {}) as Record<string, unknown>

  events.push({
    type: EventType.STATE_SNAPSHOT,
    snapshot: sanitizeForAgui(values) as Record<string, unknown>,
  })

  const activeInterrupt = getFirstActiveInterrupt(graphState)
  if (activeInterrupt) {
    events.push(...emitInterruptAgUiEvents(activeInterrupt, input))
    return events
  }

  if (options.emitFinalSummary && options.formatSummary) {
    const summary = options.formatSummary(values)
    if (summary)
      events.push(...emitSummaryTextEvents(summary))
  }

  events.push({
    type: EventType.RUN_FINISHED,
    threadId: input.threadId,
    runId: input.runId,
  })

  return events
}

export function createRunAguiEventStream(
  graph: CompiledStateGraph<any, any, any>,
  input: RunAgentInput,
  options: GraphAguiStreamOptions,
): Observable<BaseEvent> {
  const { runId, threadId } = input
  const config = graphConfigFromThreadId(threadId)
  const ctx = createStreamMapContext()

  const resumeData = options.extractResume?.(input)
  const streamInput = resumeData != null
    ? new Command({ resume: resumeData })
    : options.resolvePayload(input)

  const runStarted: BaseEvent = {
    type: EventType.RUN_STARTED,
    threadId,
    runId,
    input,
  }

  const streamEvents$ = fromLangGraphEvents(graph, streamInput, config).pipe(
    concatMap((lgEvent) => {
      const mapped = mapLangGraphEventToAgUi(lgEvent, runId, ctx)
      return from(mapped)
    }),
  )

  // defer：等 streamEvents$ 完整结束后才 getState / 发 interrupt 或 RUN_FINISHED
  const finalize$ = defer(() =>
    from(finalizeRunEvents(graph, config, { threadId, runId }, options)),
  ).pipe(concatMap(events => from(events)))

  // 严格顺序：RUN_STARTED → LangGraph 映射事件 → finalize（SNAPSHOT / interrupt 或 RUN_FINISHED）
  return concat(of(runStarted), streamEvents$, finalize$)
}
