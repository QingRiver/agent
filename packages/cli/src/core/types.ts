import type { LlmDriver } from '@core/driver/types'
import type { Effect } from 'effect'
import type { ChatCompletionTool } from 'openai/resources/chat/completions/completions'
import { Context } from 'effect'

/** 工具权限分级:决定执行前是否走强制确认闸门 */
type ToolRisk = 'safe' | 'sensitive' | 'destructive'

export interface ToolDef {
  /** OpenAI function tool schema */
  schema: ChatCompletionTool
  /**
   * 执行工具,返回结果字符串。是一个 Effect,可 `yield* interact(...)` 转出控制权
   * (interact 工具即靠此机制),与主调度循环无缝组合。
   * - error channel 为 never:工具内部须自行消化异常(如 Effect.match),保证不 fail
   * - requirement: UI
   */
  execute: (args: Record<string, unknown>) => Effect.Effect<string, never, UI>
  /**
   * 权限分级(默认 'safe')。risk≠safe 时,执行前自动触发框架默认闸门
   * defaultConfirmGate(标准 modal ⚠️ 确认),AI 绕不过;用户取消则跳过执行。
   * 工具若需更友好的自定义确认,由 AI 在调用前主动调 ask_confirm 工具完成。
   */
  risk?: ToolRisk
}

export type { ToolRisk }

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

/**
 * 交互响应。`interruptId` 必填,用于把响应路由回正确的挂起中断点
 * (与中性协议 {@link InterruptResponse} 对齐;多源/并发中断时靠 id 匹配)。
 */
export interface InteractionResponse { interruptId: string, type: string, payload: unknown }

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
