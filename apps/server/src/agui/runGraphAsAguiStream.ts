import type { BaseEvent, RunAgentInput } from '@ag-ui/core'
import type { CompiledStateGraph } from '@langchain/langgraph'
import type { Subscriber } from 'rxjs'
import { EventType } from '@ag-ui/core'
import { createRunAguiEventStream } from './pipeline/runGraphAguiStream'

export interface GraphAguiStreamOptions {
  resolvePayload: (input: RunAgentInput) => unknown
  extractResume?: (input: RunAgentInput) => unknown
  /** 为 true 时 finalize 调用 formatSummary 并发送收尾 TEXT_MESSAGE（默认不发） */
  emitFinalSummary?: boolean
  formatSummary?: (values: Record<string, unknown>) => string
}

/** exactOptionalPropertyTypes：不把 undefined 写入可选字段 */
export function pickGraphAguiStreamOptions(
  config: GraphAguiStreamOptions,
): GraphAguiStreamOptions {
  const options: GraphAguiStreamOptions = {
    resolvePayload: config.resolvePayload,
  }
  if (config.extractResume != null)
    options.extractResume = config.extractResume
  if (config.emitFinalSummary != null)
    options.emitFinalSummary = config.emitFinalSummary
  if (config.formatSummary != null)
    options.formatSummary = config.formatSummary
  return options
}

/**
 * LangGraph streamEvents → AG-UI（RxJS 管道）：
 * - 流式：on_chat_model_* / on_tool_* 映射 TEXT / TOOL（不映射 on_chain_* → STEP）
 * - 挂起：getState → CUSTOM(on_interrupt) + RUN_FINISHED(outcome: interrupt)
 * - 恢复：Command(resume)
 */
export function runGraphAsAguiStream(
  graph: CompiledStateGraph<any, any, any>,
  input: RunAgentInput,
  subscriber: Subscriber<BaseEvent>,
  options: GraphAguiStreamOptions,
): () => void {
  const { runId, threadId } = input

  const subscription = createRunAguiEventStream(graph, input, options).subscribe({
    next: event => subscriber.next(event),
    error: (err) => {
      const message = err instanceof Error ? err.message : String(err)
      subscriber.next({ type: EventType.RUN_ERROR, message })
      subscriber.next({ type: EventType.RUN_FINISHED, threadId, runId })
      subscriber.complete()
    },
    complete: () => {
      subscriber.complete()
    },
  })

  return () => {
    subscription.unsubscribe()
  }
}
