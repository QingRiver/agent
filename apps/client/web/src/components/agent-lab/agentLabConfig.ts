import type { ReactAgentRuntimeConfig } from '@agent/graph/react-agent-prompts'
import {
  DEFAULT_REACT_AGENT_USER_PROMPT,
  REACT_AGENT_MAX_STEPS_DEFAULT,
  ReactAgentRuntimeConfigSchema,
} from '@agent/graph/react-agent-prompts'
import { z } from 'zod'

/** 本地只存服务端配置 id，正文一律 GET */
export const AGENT_LAB_ID_STORAGE_KEY = 'agent-lab:agent-config-id'
/** @deprecated 旧全文草稿 key，读取时只抽 id 后清除 */
const LEGACY_FULL_CONFIG_KEY = 'agent-lab:react-agent-config'

export type { ReactAgentRuntimeConfig }

/** Lab 表单态 = 运行字段 + UI 元数据（真相在服务端） */
export const ReactAgentLabConfigSchema = ReactAgentRuntimeConfigSchema.extend({
  name: z.string().min(1).max(80),
  description: z.string().max(200).default(''),
  builtinToolIds: z.tuple([z.literal('kb_search')]),
  updatedAt: z.number().int().nonnegative(),
  agentConfigId: z.string().min(1).max(128).nullable(),
})

export type ReactAgentLabConfig = z.infer<typeof ReactAgentLabConfigSchema>

export const DEFAULT_REACT_AGENT_LAB_CONFIG: ReactAgentLabConfig = {
  name: '通用助手',
  description: 'ask_* + kb_search 测试 Agent',
  userPrompt: DEFAULT_REACT_AGENT_USER_PROMPT,
  kbId: 'kb_default',
  maxSteps: REACT_AGENT_MAX_STEPS_DEFAULT,
  builtinToolIds: ['kb_search'],
  updatedAt: 0,
  agentConfigId: null,
}

export function labConfigFromRemote(remote: {
  id: string
  name: string
  description: string
  userPrompt: string
  kbId: string
  maxSteps: number
  updatedAt: number
}): ReactAgentLabConfig {
  return ReactAgentLabConfigSchema.parse({
    name: remote.name,
    description: remote.description,
    userPrompt: remote.userPrompt,
    kbId: remote.kbId,
    maxSteps: remote.maxSteps,
    builtinToolIds: ['kb_search'],
    updatedAt: remote.updatedAt,
    agentConfigId: remote.id,
  })
}

export function loadStoredAgentConfigId(): string | null {
  try {
    const direct = localStorage.getItem(AGENT_LAB_ID_STORAGE_KEY)?.trim()
    if (direct)
      return direct

    // 迁移：旧全文草稿只抽 id，然后删掉全文
    const legacy = localStorage.getItem(LEGACY_FULL_CONFIG_KEY)
    if (legacy == null)
      return null
    localStorage.removeItem(LEGACY_FULL_CONFIG_KEY)
    const parsed = JSON.parse(legacy) as { agentConfigId?: unknown }
    const id = typeof parsed.agentConfigId === 'string' ? parsed.agentConfigId.trim() : ''
    if (!id)
      return null
    localStorage.setItem(AGENT_LAB_ID_STORAGE_KEY, id)
    return id
  }
  catch {
    return null
  }
}

export function saveStoredAgentConfigId(id: string | null) {
  if (id == null || !id.trim()) {
    localStorage.removeItem(AGENT_LAB_ID_STORAGE_KEY)
    return
  }
  localStorage.setItem(AGENT_LAB_ID_STORAGE_KEY, id.trim())
}

export function resetAgentLabConfig(): ReactAgentLabConfig {
  saveStoredAgentConfigId(null)
  return { ...DEFAULT_REACT_AGENT_LAB_CONFIG }
}
