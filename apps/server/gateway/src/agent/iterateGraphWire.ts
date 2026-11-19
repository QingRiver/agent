import type { CompiledGraphApp } from './graphRuntime'
import type { LangGraphWireEvent } from './langgraphWire'
import { projectLangGraphChunk } from './langgraphWire'

export interface IterateGraphWireOptions {
  signal?: AbortSignal
  configurable: Record<string, unknown>
  recursionLimit?: number
}

/** 编译图 stream → 已投影的 wire 事件 */
export async function* iterateGraphWireEvents(
  graph: CompiledGraphApp,
  input: unknown,
  options: IterateGraphWireOptions,
): AsyncGenerator<LangGraphWireEvent> {
  // 各图 State 不同；注册表 buildInput 已按图构造，此处放宽入参类型
  const chunks = await graph.stream(input as never, {
    streamMode: ['messages', 'updates', 'custom'],
    configurable: options.configurable,
    ...(options.signal != null ? { signal: options.signal } : {}),
    ...(options.recursionLimit != null ? { recursionLimit: options.recursionLimit } : {}),
  })
  for await (const chunk of chunks) {
    for (const event of projectLangGraphChunk(chunk))
      yield event
  }
}
