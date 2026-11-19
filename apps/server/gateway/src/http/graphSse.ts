import type { Context } from 'hono'
import type { AppEnv } from '../types'
import { streamSSE } from 'hono/streaming'

type SseWriter = (stream: {
  writeSSE: (message: { data: string }) => Promise<void>
}) => Promise<void>

/**
 * LangGraph SSE 响应。
 * streamSSE 会带上 transfer-encoding / connection；HTTP/2 禁止这两种头，
 * 写出去会把 Node 进程打崩。删掉后 h2 和 h1 都能把 SSE 流出去。
 */
export function createGraphSseResponse(c: Context<AppEnv>, write: SseWriter) {
  const response = streamSSE(c, async (stream) => {
    await write(stream)
  })
  response.headers.delete('transfer-encoding')
  response.headers.delete('connection')
  return response
}
