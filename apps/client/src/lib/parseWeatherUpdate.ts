export type WeatherBubbleKind
  = | 'user'
    | 'assistant'
    | 'tool-call'
    | 'tool-result'
    | 'error'

export interface WeatherChatMessage {
  id: string
  kind: WeatherBubbleKind
  content: string
  toolName?: string
  toolArgs?: Record<string, unknown>
}

interface LangChainConstructor {
  lc?: number
  type?: string
  id?: string[]
  kwargs?: Record<string, unknown>
}

function extractTextContent(content: unknown): string {
  if (typeof content === 'string')
    return content.trim()
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string')
          return part
        if (part && typeof part === 'object' && 'text' in part)
          return String((part as { text: unknown }).text)
        return ''
      })
      .join('')
      .trim()
  }
  return ''
}

function isLangChainMessage(raw: unknown): raw is LangChainConstructor {
  return raw != null
    && typeof raw === 'object'
    && (raw as LangChainConstructor).type === 'constructor'
    && Array.isArray((raw as LangChainConstructor).id)
}

function messageClassName(id: string[] | undefined): string {
  return id?.[id.length - 1] ?? ''
}

function parseAiMessage(kwargs: Record<string, unknown>): WeatherChatMessage[] {
  const out: WeatherChatMessage[] = []
  const msgId = String(kwargs.id ?? crypto.randomUUID())
  const text = extractTextContent(kwargs.content)

  if (text) {
    out.push({
      id: `ai-${msgId}`,
      kind: 'assistant',
      content: text,
    })
  }

  const toolCalls = kwargs.tool_calls
  if (Array.isArray(toolCalls)) {
    for (const raw of toolCalls) {
      if (!raw || typeof raw !== 'object')
        continue
      const tc = raw as Record<string, unknown>
      const callId = String(tc.id ?? `${msgId}-tool`)
      const name = String(tc.name ?? 'unknown')
      const args = tc.args && typeof tc.args === 'object'
        ? tc.args as Record<string, unknown>
        : undefined
      const argsText = args ? JSON.stringify(args, null, 0) : ''

      out.push({
        id: `tool-call-${callId}`,
        kind: 'tool-call',
        content: argsText
          ? `调用工具 ${name}（${argsText}）`
          : `调用工具 ${name}`,
        toolName: name,
        toolArgs: args,
      })
    }
  }

  return out
}

function parseToolMessage(kwargs: Record<string, unknown>): WeatherChatMessage[] {
  const callId = String(kwargs.tool_call_id ?? crypto.randomUUID())
  const name = String(kwargs.name ?? 'tool')
  const content = extractTextContent(kwargs.content) || '（无返回内容）'

  return [{
    id: `tool-result-${callId}`,
    kind: 'tool-result',
    content,
    toolName: name,
  }]
}

function parseSingleMessage(raw: unknown): WeatherChatMessage[] {
  if (!isLangChainMessage(raw))
    return []

  const kwargs = raw.kwargs
  if (!kwargs || typeof kwargs !== 'object')
    return []

  const cls = messageClassName(raw.id)
  if (cls === 'AIMessage')
    return parseAiMessage(kwargs)
  if (cls === 'ToolMessage')
    return parseToolMessage(kwargs)
  if (cls === 'HumanMessage') {
    const text = extractTextContent(kwargs.content)
    if (!text)
      return []
    return [{
      id: `human-${String(kwargs.id ?? crypto.randomUUID())}`,
      kind: 'user',
      content: text,
    }]
  }

  return []
}

/** 从 LangGraph `updates` SSE 的 data 字段解析出可展示的气泡消息 */
export function parseWeatherUpdate(
  data: Record<string, unknown> | undefined,
  seenIds: Set<string>,
): WeatherChatMessage[] {
  if (!data)
    return []

  const out: WeatherChatMessage[] = []

  for (const nodeUpdate of Object.values(data)) {
    if (!nodeUpdate || typeof nodeUpdate !== 'object')
      continue
    const messages = (nodeUpdate as { messages?: unknown }).messages
    if (!Array.isArray(messages))
      continue

    for (const raw of messages) {
      for (const msg of parseSingleMessage(raw)) {
        if (seenIds.has(msg.id))
          continue
        seenIds.add(msg.id)
        out.push(msg)
      }
    }
  }

  return out
}

export function createUserMessage(text: string): WeatherChatMessage {
  return {
    id: `user-${crypto.randomUUID()}`,
    kind: 'user',
    content: text,
  }
}
