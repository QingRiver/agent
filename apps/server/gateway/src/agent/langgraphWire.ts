import { WRITER_REASONING_EVENT } from '@agent/proto'
import { AIMessage, BaseMessage, ToolMessage } from '@langchain/core/messages'

export type FlatMessageType = 'human' | 'ai' | 'system' | 'tool'

/** assistant-ui `convertLangChainMessages` 认的扁平消息，不是 LangChain `lc/kwargs`。 */
export interface FlatLangGraphMessage {
  id?: string
  type: FlatMessageType
  content: unknown
  name?: string
  tool_calls?: unknown
  /** 流式工具参数。assistant-ui 把 `type: "ai"` 当 chunk，只从这里累积 tool call。 */
  tool_call_chunks?: unknown
  tool_call_id?: string
  additional_kwargs?: Record<string, unknown>
  status?: 'success' | 'error'
}

export interface LangGraphInterrupt {
  id: string
  value: unknown
}

export interface LangGraphWireEvent {
  event: 'messages' | 'updates' | 'custom' | 'error'
  data: unknown
}

const FLAT_TYPES = new Set<FlatMessageType>(['human', 'ai', 'system', 'tool'])

function isFlatType(value: string): value is FlatMessageType {
  return FLAT_TYPES.has(value as FlatMessageType)
}

function contentToText(content: unknown): string {
  if (typeof content === 'string')
    return content.trim()
  if (!Array.isArray(content))
    return ''
  return content
    .map((block) => {
      if (typeof block === 'string')
        return block
      if (block != null && typeof block === 'object' && 'text' in block)
        return String((block as { text?: unknown }).text ?? '')
      return ''
    })
    .join('')
    .trim()
}

export function lastHumanText(
  messages: ReadonlyArray<{ type?: string, content?: unknown }>,
  fallback: string,
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message?.type !== 'human')
      continue
    const text = contentToText(message.content)
    if (text)
      return text
  }
  return fallback
}

export function flattenLangChainMessage(message: unknown): FlatLangGraphMessage | null {
  if (!BaseMessage.isInstance(message))
    return null
  return flattenBaseMessage(message)
}

function nonemptyArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) && value.length > 0 ? value : undefined
}

/** 流式 chunk 的 `tool_calls` 往往是空数组，参数在 `tool_call_chunks`。两者都要留下。 */
function copyToolCallFields(flat: FlatLangGraphMessage, source: object) {
  const record = source as { tool_calls?: unknown, tool_call_chunks?: unknown }
  const toolCalls = nonemptyArray(record.tool_calls)
  if (toolCalls)
    flat.tool_calls = toolCalls
  const toolCallChunks = nonemptyArray(record.tool_call_chunks)
  if (toolCallChunks)
    flat.tool_call_chunks = toolCallChunks
}

function flattenBaseMessage(message: BaseMessage): FlatLangGraphMessage | null {
  const type = message.getType()
  if (!isFlatType(type))
    return null

  const flat: FlatLangGraphMessage = {
    type,
    content: message.content,
  }
  if (message.id)
    flat.id = message.id
  if (message.name)
    flat.name = message.name
  if (message.additional_kwargs != null && Object.keys(message.additional_kwargs).length > 0)
    flat.additional_kwargs = message.additional_kwargs
  if (AIMessage.isInstance(message))
    copyToolCallFields(flat, message)
  if (ToolMessage.isInstance(message)) {
    flat.tool_call_id = message.tool_call_id
    if (message.status === 'success' || message.status === 'error')
      flat.status = message.status
  }
  applyReasoningContent(flat)
  return flat
}

function reasoningText(additional: Record<string, unknown> | undefined): string | undefined {
  const value = additional?.reasoning_content
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function hasReasoningBlock(content: unknown): boolean {
  return Array.isArray(content) && content.some((part) => {
    return part != null && typeof part === 'object' && (part as { type?: unknown }).type === 'reasoning'
  })
}

/**
 * DeepSeek 把思考放在 `additional_kwargs.reasoning_content`。
 * assistant-ui 只渲染 content 里的 `{ type: "reasoning", reasoning }`。
 */
function applyReasoningContent(flat: FlatLangGraphMessage) {
  const reasoning = reasoningText(flat.additional_kwargs)
  if (!reasoning || hasReasoningBlock(flat.content))
    return

  const blocks: unknown[] = [{ type: 'reasoning', reasoning }]
  if (typeof flat.content === 'string') {
    if (flat.content.length > 0)
      blocks.push({ type: 'text', text: flat.content })
  }
  else if (Array.isArray(flat.content)) {
    blocks.push(...flat.content)
  }
  flat.content = blocks
}

export function normalizeLangGraphInterrupt(raw: unknown): LangGraphInterrupt | null {
  if (raw == null || typeof raw !== 'object')
    return null
  const record = raw as { id?: unknown, value?: unknown }
  if (typeof record.id !== 'string' || record.id === '')
    return null
  return { id: record.id, value: record.value }
}

interface SnapshotTask {
  interrupts?: unknown[]
}

/** checkpoint `tasks[].interrupts` → `{ id, value }`。 */
export function readSnapshotInterrupts(snapshot: { tasks?: SnapshotTask[] }): LangGraphInterrupt[] {
  const interrupts: LangGraphInterrupt[] = []
  for (const task of snapshot.tasks ?? []) {
    for (const raw of task.interrupts ?? []) {
      const interrupt = normalizeLangGraphInterrupt(raw)
      if (interrupt)
        interrupts.push(interrupt)
    }
  }
  return interrupts
}

export function readSnapshotMessages(values: { messages?: unknown }): FlatLangGraphMessage[] {
  if (!Array.isArray(values.messages))
    return []
  const messages: FlatLangGraphMessage[] = []
  for (const item of values.messages) {
    const flat = flattenLangChainMessage(item)
    if (flat)
      messages.push(flat)
  }
  return messages
}

/**
 * 把 `graph.stream` 的一块收成 assistant-ui 事件。
 * `messages` 只扁平化后原样转发。节点输出的消息已在这条通道上。
 * `updates` 剥掉 `messages`，留下其余状态和 `__interrupt__`。
 * assistant-ui 看到 updates 里的同 id 消息会再拼进气泡。
 */
export function projectLangGraphChunk(chunk: unknown): LangGraphWireEvent[] {
  if (!Array.isArray(chunk) || chunk.length < 2)
    return []

  const [mode, data] = chunk
  if (mode === 'messages')
    return projectMessagesTuple(data)
  if (mode === 'updates')
    return projectUpdates(data)
  if (mode === 'custom')
    return projectCustom(data)
  return []
}

/** 改稿思考增量改成 assistant-ui 能累加的 reasoning 块。正文仍留在节点里。 */
function projectCustom(data: unknown): LangGraphWireEvent[] {
  const reasoning = reasoningMessageFromCustom(data)
  if (reasoning)
    return [reasoning]
  return [{ event: 'custom', data }]
}

function reasoningMessageFromCustom(data: unknown): LangGraphWireEvent | null {
  if (data == null || typeof data !== 'object')
    return null
  const record = data as { name?: unknown, payload?: unknown }
  if (record.name !== WRITER_REASONING_EVENT)
    return null
  const payload = record.payload
  if (payload == null || typeof payload !== 'object')
    return null
  const { id, delta } = payload as { id?: unknown, delta?: unknown }
  if (typeof id !== 'string' || id === '' || typeof delta !== 'string' || delta === '')
    return null
  return {
    event: 'messages',
    data: [{
      type: 'ai',
      id,
      content: [{ type: 'reasoning', reasoning: delta }],
    }, {}],
  }
}

function projectMessagesTuple(data: unknown): LangGraphWireEvent[] {
  if (!Array.isArray(data) || data.length < 1)
    return []
  const flat = flattenLangChainMessage(data[0])
  if (!flat)
    return []
  const metadata = data[1] != null && typeof data[1] === 'object' && !Array.isArray(data[1])
    ? data[1]
    : {}
  return [{ event: 'messages', data: [flat, metadata] }]
}

/** 节点 update 里的消息已由 messages 通道发出，这里只留其余状态。 */
function stateWithoutMessages(value: unknown): Record<string, unknown> | undefined {
  if (value == null || typeof value !== 'object' || Array.isArray(value))
    return undefined
  const rest = { ...value as Record<string, unknown> }
  delete rest.messages
  return Object.keys(rest).length > 0 ? rest : undefined
}

function projectUpdates(data: unknown): LangGraphWireEvent[] {
  if (data == null || typeof data !== 'object' || Array.isArray(data))
    return []

  const record = data as Record<string, unknown>
  const next: Record<string, unknown> = {}

  if (Array.isArray(record.__interrupt__)) {
    const interrupts = record.__interrupt__
      .map(normalizeLangGraphInterrupt)
      .filter((item): item is LangGraphInterrupt => item != null)
    if (interrupts.length > 0)
      next.__interrupt__ = interrupts
  }

  for (const [node, value] of Object.entries(record)) {
    if (node === '__interrupt__')
      continue
    const state = stateWithoutMessages(value)
    if (state)
      next[node] = state
  }

  return [{ event: 'updates', data: next }]
}
