import type { LlmDriver } from '@core/driver/types'
import type { Effect } from 'effect'
import type { ChatCompletionTool } from 'openai/resources/chat/completions/completions'
import { Context } from 'effect'

export interface ToolDef {
  /** OpenAI function tool schema */
  schema: ChatCompletionTool
  /** 执行工具,返回结果字符串(纯异步工作,不转出控制权) */
  execute: (args: Record<string, unknown>) => Promise<string>
  /**
   * 执行前的人机确认(可选)。是一个 Effect,通过 `yield* interact(...)` 多次转出控制权
   * (input/select/multiSelect/modal 任意顺序),与主调度循环无缝组合。
   * - return args(可修改):继续执行
   * - return null:用户拒绝,跳过执行
   * - requirement: UI
   */
  confirm?: (args: Record<string, unknown>) => Effect.Effect<Record<string, unknown> | null, never, UI>
}

export type UIMessage
  = | { kind: 'user', content: string }
    | { kind: 'assistant', content: string }
    | { kind: 'toolResult', name: string, result: string }

/** 通用选项 */
export interface SelectOption {
  label: string
  value: string
  description?: string
}

/** 交互请求 */
export type InteractionRequest
  = | { type: 'input', message: string, placeholder?: string }
    | { type: 'select', message: string, options: SelectOption[] }
    | { type: 'multiSelect', message: string, options: SelectOption[] }
    | { type: 'modal', title: string, body: string, actions: string[] }
    | { type: 'unlock', message: string, key: string }

/** 交互响应 */
export interface InteractionResponse { type: string, payload: unknown }

export interface I_UI {
  /** 推一条 UI 条目(同步) */
  pushHistory: (message: UIMessage) => void
  /** 流式渲染当前消息(同步) */
  streaming: {
    /** 清空流式 buffer */
    reset: () => void
    /** 追加一个 chunk */
    append: (chunk: string) => void
    /** 取出当前完整内容并清空,用于"流结束 → 冻结进 scrollback" */
    commit: () => string
  }
  /** HITL:发请求 → 挂起 → 等用户响应(Effect,内部 Effect.async) */
  interact: (request: InteractionRequest) => Effect.Effect<InteractionResponse>
  /** spinner */
  setSpinner: (label: string | null) => void
}

/**
 * Effect 服务标签:在 Effect 程序里用 `yield* UI` 访问 `I_UI`,
 * Ink 层用 `Layer.succeed(UI, impl)` 注入具体实现,与业务逻辑解耦。
 */
export class UI extends Context.Tag('UI')<UI, I_UI>() {}

/** LLM driver */
export class Driver extends Context.Tag('Driver')<Driver, LlmDriver>() {}
