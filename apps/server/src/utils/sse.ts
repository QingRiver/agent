import { Readable } from 'node:stream'

export function sseEvent(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`
}

export function createSseStream(source: AsyncIterable<string>): Readable {
  return Readable.from(source)
}

export async function* streamSimpleGraphSse(
  stream: AsyncIterable<Record<string, unknown>>,
): AsyncGenerator<string> {
  yield sseEvent({ type: 'start' })

  for await (const update of stream) {
    yield sseEvent({ type: 'update', data: update })
  }

  yield sseEvent({ type: 'done' })
  yield 'data: [DONE]\n\n'
}
