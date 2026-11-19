import type { ReactAgentRuntimeConfig } from '@agent/graph/react-agent-prompts'
import { REACT_AGENT_MAX_STEPS_DEFAULT } from '@agent/graph/react-agent-config'
import {
  DEFAULT_REACT_AGENT_USER_PROMPT,
  ReactAgentRuntimeConfigSchema,
} from '@agent/graph/react-agent-prompts'
import { z } from 'zod'

/** 本地只存服务端配置 id，正文一律 GET */
export const AGENT_LAB_ID_STORAGE_KEY = 'agent-lab:agent-config-id'

export type { ReactAgentRuntimeConfig }

/** Lab 表单态 = 运行字段 + UI 元数据（真相在服务端） */
export const ReactAgentLabConfigSchema = ReactAgentRuntimeConfigSchema.extend({
  name: z.string().min(1).max(80),
  description: z.string().max(200).default(''),
  builtinToolIds: z.tuple([z.literal('kb_search')]),
  skillCodes: z.array(z.string().min(1).max(64)).max(32).default([]),
  updatedAt: z.number().int().nonnegative(),
  agentConfigId: z.string().min(1).max(128).nullable(),
})

export type ReactAgentLabConfig = z.infer<typeof ReactAgentLabConfigSchema>

export const DEFAULT_REACT_AGENT_LAB_CONFIG: ReactAgentLabConfig = {
  name: '通用助手',
  description: 'ask_* + kb_search 测试 Agent',
  userPrompt: DEFAULT_REACT_AGENT_USER_PROMPT,
  kbId: '',
  maxSteps: REACT_AGENT_MAX_STEPS_DEFAULT,
  builtinToolIds: ['kb_search'],
  skillCodes: [],
  updatedAt: 0,
  agentConfigId: null,
}

export function parseSkillCodesInput(raw: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const part of raw.split(/[,\s]+/)) {
    const code = part.trim().slice(0, 64)
    if (!code || seen.has(code))
      continue
    seen.add(code)
    out.push(code)
  }
  return out.slice(0, 32)
}

export function labConfigFromRemote(remote: {
  id: string
  name: string
  description: string
  userPrompt: string
  kbId: string
  maxSteps: number
  skillCodes?: string[] | undefined
  updatedAt: number
}): ReactAgentLabConfig {
  return ReactAgentLabConfigSchema.parse({
    name: remote.name,
    description: remote.description,
    userPrompt: remote.userPrompt,
    kbId: remote.kbId,
    maxSteps: remote.maxSteps,
    builtinToolIds: ['kb_search'],
    skillCodes: remote.skillCodes ?? [],
    updatedAt: remote.updatedAt,
    agentConfigId: remote.id,
  })
}

export function loadStoredAgentConfigId(): string | null {
  try {
    const id = localStorage.getItem(AGENT_LAB_ID_STORAGE_KEY)?.trim()
    return id || null
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
