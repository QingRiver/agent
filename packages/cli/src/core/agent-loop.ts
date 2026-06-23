import type { ToolDef } from '@core/types'
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from 'openai/resources/chat/completions/completions'
import { chat, pushAssistant, pushToolResult, pushUser, setSpinner } from '@core/agent-effect'
import { Effect } from 'effect'
import { match, P } from 'ts-pattern'

/** 一轮用户输入的完整 react 循环(requirement: Driver | UI,由 helpers 汇出) */
export function agentLoop(userText: string, tools: ToolDef[], llmMessages: ChatCompletionMessageParam[]) {
  return Effect.gen(function* () {
    // 用户消息入真相 + UI 投影
    llmMessages.push({ role: 'user', content: userText })
    yield* pushUser(userText)

    const schemas = tools.map(t => t.schema)
    while (true) {
      const result = yield* chat(llmMessages, schemas.length > 0 ? schemas : undefined)
      llmMessages.push(result)
      const content = contentOf(result)
      if (content)
        yield* pushAssistant(content)

      const toolCalls = toolCallsOf(result)
      if (toolCalls.length === 0)
        return

      for (const tc of toolCalls)
        yield* handleToolCall(tc, tools, llmMessages)
        // 带 tool 结果再次 chat(react)
    }
  })
}

/** 处理单个 tool_call:确认(HITL)→ 执行 → 拼入 tool 消息(requirement: UI) */
function handleToolCall(tc: ChatCompletionMessageToolCall, tools: ToolDef[], llmMessages: ChatCompletionMessageParam[]) {
  return Effect.gen(function* () {
    const name = tc.function.name
    const tool = tools.find(t => t.schema.function.name === name)

    if (!tool) {
      const msg = `工具 ${name} 未定义`
      yield* pushToolResult(name, msg)
      llmMessages.push({ role: 'tool', tool_call_id: tc.id, content: msg })
      return
    }

    let args: Record<string, unknown> = {}
    try {
      args = JSON.parse(tc.function.arguments) as Record<string, unknown>
    }
    catch {
      args = {}
    }

    // HITL 确认(可多步);返回 null = 用户拒绝
    if (tool.confirm) {
      const confirmed = yield* tool.confirm(args)
      if (confirmed === null) {
        const msg = '用户拒绝执行'
        yield* pushToolResult(name, msg)
        llmMessages.push({ role: 'tool', tool_call_id: tc.id, content: msg })
        return
      }
      args = confirmed
    }

    // 执行(execute 是纯 Promise,不转出控制权;spinner 用 effect 包裹)
    yield* setSpinner(`正在执行 ${name}...`)
    let result: string
    try {
      result = yield* Effect.promise(() => tool.execute(args))
    }
    catch (err) {
      result = `工具执行失败:${err instanceof Error ? err.message : String(err)}`
    }
    yield* setSpinner(null)

    yield* pushToolResult(name, result)
    llmMessages.push({ role: 'tool', tool_call_id: tc.id, content: result })
  })
}

function toolCallsOf(message: ChatCompletionMessageParam): ChatCompletionMessageToolCall[] {
  return match(message)
    .with({ role: 'assistant' }, m => m.tool_calls ?? [])
    .otherwise(() => [])
}

function contentOf(message: ChatCompletionMessageParam): string {
  return match(message)
    .with({ role: 'assistant' }, (m) => {
      const partText = (part: { type: 'text', text: string } | { type: 'refusal', refusal: string }) =>
        match(part)
          .with({ type: 'text' }, p => p.text)
          .with({ type: 'refusal' }, p => p.refusal)
          .exhaustive()

      const fromContent = match(m.content)
        .with(P.string, c => c)
        .with(P.nullish, () => '')
        .with(P.array(), parts => parts.map(partText).join(''))
        .exhaustive()

      return fromContent || (m.refusal ?? '')
    })
    .otherwise(() => '')
}
