import type { CompiledStateGraph } from '@langchain/langgraph'
import { Observable } from 'rxjs'

export interface LangGraphStreamEvent {
  event: string
  name?: string
  data?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export function fromLangGraphEvents(
  graph: CompiledStateGraph<any, any, any>,
  input: unknown,
  config: { configurable: { thread_id: string } },
): Observable<LangGraphStreamEvent> {
  return new Observable((subscriber) => {
    let cancelled = false

    void (async () => {
      try {
        const stream = graph.streamEvents(
          input as Parameters<typeof graph.streamEvents>[0],
          { ...config, version: 'v2' },
        )
        for await (const raw of stream) {
          if (cancelled)
            break
          subscriber.next(raw as LangGraphStreamEvent)
        }
        if (!cancelled)
          subscriber.complete()
      }
      catch (err) {
        if (!cancelled)
          subscriber.error(err)
      }
    })()

    return () => {
      cancelled = true
    }
  })
}
