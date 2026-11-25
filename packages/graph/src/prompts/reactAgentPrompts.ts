import { z } from 'zod'
import {
  REACT_AGENT_MAX_STEPS_DEFAULT,
  REACT_AGENT_MAX_STEPS_MAX,
  REACT_AGENT_MAX_STEPS_MIN,
  REACT_AGENT_USER_PROMPT_MAX,
} from '../config/reactAgent'

/** 产品路径：只传配置 id；服务端 middleware 再装 RuntimeBundle */
export const AGENT_CONFIG_ID_PROPS_KEY = 'agentConfigId' as const

/** Lab / 默认配置用的可测 userPrompt 模板（平台级工具纪律由内置 skill 经 skillText 注入，此处只留角色与风格） */
export const DEFAULT_REACT_AGENT_USER_PROMPT = [
  '# 角色',
  '你是一个乐于助人的通用助手，可检索知识库，并在缺信息时向用户提问。',
  '',
  '## 回答风格',
  '- 简洁、可执行；有引用时写标准 Markdown 链接，不要脚注。',
].join('\n')

/** 请求级运行配置（不含 Lab UI 元数据） */
export const ReactAgentRuntimeConfigSchema = z.object({
  userPrompt: z.string().max(REACT_AGENT_USER_PROMPT_MAX),
  kbId: z.string().max(128),
  /** 图节点转移上限（= LangGraph recursionLimit） */
  maxSteps: z.number().int().min(REACT_AGENT_MAX_STEPS_MIN).max(REACT_AGENT_MAX_STEPS_MAX),
})

export type ReactAgentRuntimeConfig = z.infer<typeof ReactAgentRuntimeConfigSchema>

/**
 * 与服务端一致的最终 system 拼接。
 * 平台级规约（ask 纪律 / KB 引用 / html_card 写作规约）由内置 skill 经 skillText 注入，
 * 此处只拼 userPrompt + skillText。配置页预览不传 skillText 时仅显示 userPrompt。
 */
export function composeReactAgentSystemPrompt(userPrompt: string, skillText?: string): string {
  const parts = [userPrompt.trim() || DEFAULT_REACT_AGENT_USER_PROMPT]
  const extra = skillText?.trim()
  if (extra)
    parts.push(extra)
  return parts.join('\n\n---\n\n')
}

/** 唯一环控配置：直接作为 graph.stream 的 recursionLimit */
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
 * 读取 reactAgent 运行配置（partial）。
 * 非法结构返回空对象。
 */
export interface ReactAgentSkillBinding {
  code: string
  name?: string
  strategy: 'latest'
}

export interface ReactAgentSkillExtras {
  skillText?: string
  skillBindings?: ReactAgentSkillBinding[]
}

function readSkillExtras(raw: unknown): ReactAgentSkillExtras {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw))
    return {}
  const rec = raw as Record<string, unknown>
  const out: ReactAgentSkillExtras = {}
  if (typeof rec.skillText === 'string')
    out.skillText = rec.skillText
  if (Array.isArray(rec.skillBindings)) {
    const skillBindings: ReactAgentSkillBinding[] = []
    for (const item of rec.skillBindings) {
      if (item != null && typeof item === 'object' && typeof (item as { code?: unknown }).code === 'string') {
        const name = (item as { name?: unknown }).name
        skillBindings.push({
          code: (item as { code: string }).code,
          ...(typeof name === 'string' && name.trim() ? { name: name.trim() } : {}),
          strategy: 'latest',
        })
      }
    }
    if (skillBindings.length > 0)
      out.skillBindings = skillBindings
  }
  return out
}

export function readReactAgentRuntimeConfig(
  raw: unknown,
): Partial<ReactAgentRuntimeConfig> & ReactAgentSkillExtras {
  const parsed = ReactAgentRuntimeConfigSchema.partial().safeParse(raw)
  const extras = readSkillExtras(raw)
  if (!parsed.success)
    return extras
  const out: Partial<ReactAgentRuntimeConfig> & ReactAgentSkillExtras = { ...extras }
  if (parsed.data.userPrompt !== undefined)
    out.userPrompt = parsed.data.userPrompt
  if (parsed.data.kbId !== undefined)
    out.kbId = parsed.data.kbId
  if (parsed.data.maxSteps !== undefined)
    out.maxSteps = parsed.data.maxSteps
  return out
}

/** 从运行参数读 agentConfigId；非法则 undefined */
export function readAgentConfigId(raw: unknown): string | undefined {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw))
    return undefined
  const idRaw = (raw as Record<string, unknown>)[AGENT_CONFIG_ID_PROPS_KEY]
  if (typeof idRaw !== 'string')
    return undefined
  const id = idRaw.trim()
  return id.length > 0 ? id.slice(0, 128) : undefined
}
