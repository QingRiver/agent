import type { RunAgentInput } from '@ag-ui/core'
import { ASK_TOOLS_SYSTEM_PROMPT } from '@agent/protocol'
import { z } from 'zod'

/** CopilotKit `properties` / `RunAgentInput.forwardedProps` 上的 reactAgent 命名空间 */
export const REACT_AGENT_FORWARDED_PROPS_KEY = 'reactAgent' as const

/** 平台 KB 工具引导（仅服务端拼接进 system，客户端不可覆盖） */
export const KB_SEARCH_SYSTEM_PROMPT = [
  '涉及已导入知识库内容的问题时，必须先调用 kb_search，再据返回的引用片段作答。',
  '回答正文使用标准 Markdown 链接引用：直接使用工具结果里给出的形式，例如 `[1](/kb?path=…&chunk=…)`；不要写裸 `[1]`，也不要脚注。',
  '工具返回未找到或澄清建议时如实转达，禁止臆造。问题明显与知识库无关时可直接作答。',
].join('\n')

/** Lab / 默认配置用的可测 userPrompt 模板 */
export const DEFAULT_REACT_AGENT_USER_PROMPT = [
  '# 角色',
  '你是一个乐于助人的通用助手，可检索知识库，并在缺信息时向用户提问。',
  '',
  '## 工具使用',
  '- 问题可能涉及已导入知识库内容时：先调用 `kb_search`，再按工具给出的 Markdown 链接（如 `[1](/kb?path=…&chunk=…)`）在正文标注来源；禁止臆造库内事实。',
  '- 缺少必要信息（城市、订单号、选项未定等）时：必须调用 `ask_input` / `ask_choice` / `ask_multi_choice` / `ask_confirm`，禁止在正文里用自然语言追问。',
  '- 调用 ask_* 的当轮不要同时输出解释性正文；等工具返回后再继续。',
  '',
  '## 回答风格',
  '- 简洁、可执行；有引用时写标准 Markdown 链接，不要脚注。',
].join('\n')

export const REACT_AGENT_USER_PROMPT_MAX = 32_000
/** 图节点转移上限（= LangGraph recursionLimit）；默认高于框架自带 25 */
export const REACT_AGENT_MAX_STEPS_DEFAULT = 50
export const REACT_AGENT_MAX_STEPS_MIN = 1
export const REACT_AGENT_MAX_STEPS_MAX = 200

/** 请求级运行配置（不含 Lab UI 元数据） */
export const ReactAgentRuntimeConfigSchema = z.object({
  userPrompt: z.string().max(REACT_AGENT_USER_PROMPT_MAX),
  kbId: z.string().min(1).max(128),
  /** 图节点转移上限（= LangGraph recursionLimit） */
  maxSteps: z.number().int().min(REACT_AGENT_MAX_STEPS_MIN).max(REACT_AGENT_MAX_STEPS_MAX),
})

export type ReactAgentRuntimeConfig = z.infer<typeof ReactAgentRuntimeConfigSchema>

/** 与服务端一致的最终 system 拼接（配置页预览用） */
export function composeReactAgentSystemPrompt(userPrompt: string): string {
  return [
    userPrompt.trim() || DEFAULT_REACT_AGENT_USER_PROMPT,
    ASK_TOOLS_SYSTEM_PROMPT,
    KB_SEARCH_SYSTEM_PROMPT,
  ].join('\n\n---\n\n')
}

/** 唯一环控配置：直接作为 streamEvents.recursionLimit */
export function clampMaxSteps(raw: unknown): number {
  const n = typeof raw === 'number' && Number.isFinite(raw)
    ? Math.trunc(raw)
    : REACT_AGENT_MAX_STEPS_DEFAULT
  return Math.min(
    REACT_AGENT_MAX_STEPS_MAX,
    Math.max(REACT_AGENT_MAX_STEPS_MIN, n),
  )
}

export function sanitizeUserPrompt(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : ''
  const trimmed = s.slice(0, REACT_AGENT_USER_PROMPT_MAX)
  return trimmed.trim() ? trimmed : DEFAULT_REACT_AGENT_USER_PROMPT
}

export function sanitizeKbId(raw: unknown, fallback = 'kb_default'): string {
  if (typeof raw === 'string' && raw.trim())
    return raw.trim().slice(0, 128)
  return fallback
}

/**
 * 从 RunAgentInput.forwardedProps.reactAgent 读取运行配置（partial）。
 * 非法结构返回空对象，由调用方回退到 state / 默认值。
 */
export function readReactAgentForwardedProps(
  input: Pick<RunAgentInput, 'forwardedProps'>,
): Partial<ReactAgentRuntimeConfig> {
  const props = input.forwardedProps
  if (props == null || typeof props !== 'object' || Array.isArray(props))
    return {}
  const raw = (props as Record<string, unknown>)[REACT_AGENT_FORWARDED_PROPS_KEY]
  const parsed = ReactAgentRuntimeConfigSchema.partial().safeParse(raw)
  if (!parsed.success)
    return {}
  const out: Partial<ReactAgentRuntimeConfig> = {}
  if (parsed.data.userPrompt !== undefined)
    out.userPrompt = parsed.data.userPrompt
  if (parsed.data.kbId !== undefined)
    out.kbId = parsed.data.kbId
  if (parsed.data.maxSteps !== undefined)
    out.maxSteps = parsed.data.maxSteps
  return out
}
