import type { InteractionRequest, InteractionResponse } from '@core/types'
import type { ChatCompletionFunctionTool, ChatCompletionMessageParam } from 'openai/resources/chat/completions/completions'
import { Driver, UI } from '@core/types'
import { Effect } from 'effect'

/** 发起一次 LLM chat(流式 delta 直接灌入 UI.streaming buffer),返回 assistant 消息 */
export function chat(messages: ChatCompletionMessageParam[], tools?: ChatCompletionFunctionTool[]): Effect.Effect<ChatCompletionMessageParam, never, Driver | UI> {
  return Effect.gen(function* () {
    const driver = yield* Driver
    const ui = yield* UI
    ui.streaming.reset()
    ui.reasoning.reset()
    let textStarted = false
    const result = yield* Effect.promise(() =>
      driver.chat(messages, tools, (event) => {
        if (event.type === 'reasoning_delta') {
          // 思考过程实时流入 reasoning buffer(DeepSeek 先 reasoning 后 text)
          ui.reasoning.append(event.content)
        }
        else if (event.type === 'text_delta') {
          // 首个 text delta 到来时,把已累积的思考冻结进 scrollback,再开始正文流式
          if (!textStarted) {
            textStarted = true
            const r = ui.reasoning.commit()
            if (r)
              ui.pushHistory({ kind: 'reasoning', content: r })
          }
          ui.streaming.append(event.content)
        }
      }),
    )
    // 全程只有 reasoning 没 text(如纯工具调用):也把思考冻结进 scrollback
    if (!textStarted) {
      const r = ui.reasoning.commit()
      if (r)
        ui.pushHistory({ kind: 'reasoning', content: r })
    }
    // 清空 buffer(副作用);冻结历史用的文本直接取 result.content,单一真相在消息上
    ui.streaming.commit()
    return result
  })
}

/** 发起一次人机交互,挂起直到用户响应(UI.interact 内部 Effect.async) */
export function interact(request: InteractionRequest): Effect.Effect<InteractionResponse, never, UI> {
  return Effect.gen(function* () {
    const ui = yield* UI
    return yield* ui.interact(request)
  })
}

/** 推一条用户消息到 UI 投影(真相 llmMessages 由调用方维护) */
export function pushUser(content: string): Effect.Effect<void, never, UI> {
  return Effect.gen(function* () {
    (yield* UI).pushHistory({ kind: 'user', content })
  })
}

/** 推一条助手 markdown 消息到 UI 投影 */
export function pushAssistant(content: string): Effect.Effect<void, never, UI> {
  return Effect.gen(function* () {
    (yield* UI).pushHistory({ kind: 'assistant', content })
  })
}

/** 推一条工具结果行到 UI 投影 */
export function pushToolResult(name: string, result: string): Effect.Effect<void, never, UI> {
  return Effect.gen(function* () {
    (yield* UI).pushHistory({ kind: 'toolResult', name, result })
  })
}

/** 设置/清除 spinner 文案(通用,与工具无关) */
export function setSpinner(label: string | null): Effect.Effect<void, never, UI> {
  return Effect.gen(function* () {
    (yield* UI).setSpinner(label)
  })
}
