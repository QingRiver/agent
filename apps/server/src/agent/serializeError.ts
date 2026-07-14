/**
 * 统一 agent 错误序列化:把任意 thrown 值序列化成 `{ message, code, name, json }`，
 * 挂到 AG-UI `RUN_ERROR` 事件的扩展字段。
 *
 * ag-ui `RunErrorEventSchema` 是 passthrough，CopilotKit runtime 原样透传，
 * 前端 `onError` 的 `context.event` 可拿到这四个字段。`json` 是完整详情的 pretty JSON
 * 字符串（hint/cause/stack/agentId/threadId/runId/原始 message 打包），前端展开详情区直接显示。
 *
 * 字段全部为 string（非可选），规避 exactOptionalPropertyTypes 的条件展开负担。
 */

/** 序列化后的 agent 错误。挂在 RUN_ERROR 事件扩展字段上，前端据此渲染可展开错误条。 */
export interface SerializedAgentError {
  /** 友好一句话，填标准 `message` 字段（前端标题） */
  message: string
  /** 错误码，填标准 `code` 字段 */
  code: string
  /** Error.name（TypeError / Error / AggregateError …） */
  name: string
  /** 完整详情的 pretty JSON 字符串（hint/cause/stack/agentId/threadId/runId/原始 message） */
  json: string
}

const STACK_MAX = 4000
const CAUSE_MAX = 2000

/** 错误分类。按 message / cause / code 字符串特征启发式匹配，产出 code+message+hint。 */
interface ErrorClass {
  code: string
  message: string
  hint?: string
}

function classifyError(text: string): ErrorClass {
  const t = text.toLowerCase()
  // 知识库基础设施未起（qdrant 6333 / markitdown 8200）
  if ((t.includes('econnrefused') || t.includes('fetch failed'))
    && (t.includes('6333') || t.includes('6334') || t.includes('8200')
      || t.includes('qdrant') || t.includes('markitdown'))) {
    return {
      code: 'KB_INFRA_DOWN',
      message: '知识库服务未启动（无法连接 qdrant / markitdown）',
      hint: '请执行 pnpm devops infra up kb 后重试',
    }
  }
  // 上游服务不可达（其余本地端口拒绝 / fetch failed）
  if (t.includes('econnrefused') || t.includes('fetch failed') || t.includes('enotfound')) {
    return {
      code: 'UPSTREAM_UNREACHABLE',
      message: '上游服务不可达',
      hint: '检查依赖服务是否已启动',
    }
  }
  // AI 鉴权失败
  if (t.includes('401') || t.includes('unauthorized') || t.includes('invalid api key')
    || t.includes('invalid_api_key') || t.includes('authentication')) {
    return {
      code: 'LLM_AUTH_FAILED',
      message: 'AI 服务鉴权失败',
      hint: '检查 OPENAI_API_KEY / SILICONFLOW_API_KEY 配置',
    }
  }
  // 限流
  if (t.includes('429') || t.includes('rate limit') || t.includes('rate_limit') || t.includes('quota')) {
    return {
      code: 'LLM_RATE_LIMITED',
      message: 'AI 服务限流，请稍后重试',
      hint: '稍候片刻再试',
    }
  }
  // 超时 / 中断
  if (t.includes('etimedout') || t.includes('timeout') || t.includes('aborted') || t.includes('econnaborted')) {
    return {
      code: 'UPSTREAM_TIMEOUT',
      message: '请求超时',
      hint: '稍后重试，或检查网络',
    }
  }
  return {
    code: 'AGENT_INTERNAL',
    message: '服务暂时不可用，请稍后重试',
  }
}

/** 递归取 Error.cause，拼成 "msg: cause1: cause2" 串。AggregateError 的 errors 也展开。 */
function serializeCause(err: Error, depth = 0): string | undefined {
  if (depth > 4)
    return undefined
  const parts: string[] = []

  const cause = (err as Error & { cause?: unknown }).cause
  if (cause instanceof Error) {
    parts.push(`${cause.name}: ${cause.message}`)
    const nested = serializeCause(cause, depth + 1)
    if (nested)
      parts.push(nested)
  }
  else if (typeof cause === 'string' && cause.trim()) {
    parts.push(cause.trim())
  }
  // AggregateError(errors[])
  const errors = (err as Error & { errors?: unknown[] }).errors
  if (Array.isArray(errors)) {
    for (const e of errors) {
      if (e instanceof Error)
        parts.push(`${e.name}: ${e.message}`)
      else if (typeof e === 'string')
        parts.push(e)
      else if (e != null)
        parts.push(String(e))
    }
  }

  if (parts.length === 0)
    return undefined
  const joined = parts.join(' | ')
  return joined.length > CAUSE_MAX ? `${joined.slice(0, CAUSE_MAX)}…` : joined
}

/**
 * 把任意 thrown 值序列化成结构化 agent 错误。
 * 非 Error 值兜底为 `String(err)`。`ctx` 三字段全 required string，调用方用 `?? ''` 处理 undefined。
 */
export function serializeAgentError(
  err: unknown,
  ctx: { agentId: string, threadId: string, runId: string },
): SerializedAgentError {
  const isError = err instanceof Error
  const name = isError ? err.name : 'Error'
  const originalMessage = isError ? err.message : String(err)
  const causeStr = isError ? serializeCause(err) : undefined
  const stack = isError && err.stack ? err.stack.slice(0, STACK_MAX) : undefined

  const codeField = isError ? String((err as Error & { code?: unknown }).code ?? '') : ''
  const errorsStr = isError
    ? (err as Error & { errors?: unknown[] }).errors?.map(e => e instanceof Error ? e.message : String(e)).join(' ')
    : undefined
  const text = [originalMessage, causeStr, codeField, errorsStr].filter(Boolean).join(' ')
  const cls = classifyError(text)

  // 完整详情打包成 json（undefined 值不进对象，JSON.stringify 干净）
  const detail: Record<string, string> = {}
  if (cls.hint)
    detail.hint = cls.hint
  if (causeStr)
    detail.cause = causeStr
  if (stack)
    detail.stack = stack
  if (ctx.agentId)
    detail.agentId = ctx.agentId
  if (ctx.threadId)
    detail.threadId = ctx.threadId
  if (ctx.runId)
    detail.runId = ctx.runId
  if (originalMessage)
    detail.error = originalMessage

  return {
    message: cls.message,
    code: cls.code,
    name,
    json: JSON.stringify(detail, null, 2),
  }
}
