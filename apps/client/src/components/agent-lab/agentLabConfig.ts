import {
  DEFAULT_REACT_AGENT_USER_PROMPT,
  REACT_AGENT_MAX_STEPS_DEFAULT,
  REACT_AGENT_MAX_STEPS_MAX,
  REACT_AGENT_MAX_STEPS_MIN,
  REACT_AGENT_USER_PROMPT_MAX,
} from '@agent/graph/react-agent-prompts'
import { z } from 'zod'

export const AGENT_LAB_STORAGE_KEY = 'agent-lab:react-agent-config'

export const ReactAgentLabConfigSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(200).default(''),
  userPrompt: z.string().max(REACT_AGENT_USER_PROMPT_MAX),
  kbId: z.string().min(1).max(128),
  /** 图节点转移上限（= LangGraph recursionLimit） */
  maxSteps: z.number().int().min(REACT_AGENT_MAX_STEPS_MIN).max(REACT_AGENT_MAX_STEPS_MAX),
  builtinToolIds: z.tuple([z.literal('kb_search')]),
  updatedAt: z.number().int().nonnegative(),
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
}

function migrateLegacyConfig(raw: unknown): unknown {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw))
    return raw
  const o = raw as Record<string, unknown>
  if (o.maxSteps != null || o.maxToolRounds == null)
    return raw
  const { maxToolRounds, ...rest } = o
  return { ...rest, maxSteps: maxToolRounds }
}

export function loadAgentLabConfig(): ReactAgentLabConfig {
  try {
    const raw = localStorage.getItem(AGENT_LAB_STORAGE_KEY)
    if (raw == null)
      return { ...DEFAULT_REACT_AGENT_LAB_CONFIG }
    const parsed = ReactAgentLabConfigSchema.safeParse(
      migrateLegacyConfig(JSON.parse(raw)),
    )
    if (!parsed.success)
      return { ...DEFAULT_REACT_AGENT_LAB_CONFIG }
    return parsed.data
  }
  catch {
    return { ...DEFAULT_REACT_AGENT_LAB_CONFIG }
  }
}

export function saveAgentLabConfig(
  config: ReactAgentLabConfig,
): ReactAgentLabConfig {
  const next = ReactAgentLabConfigSchema.parse({
    ...config,
    updatedAt: Date.now(),
  })
  localStorage.setItem(AGENT_LAB_STORAGE_KEY, JSON.stringify(next))
  return next
}

export function resetAgentLabConfig(): ReactAgentLabConfig {
  return saveAgentLabConfig({
    ...DEFAULT_REACT_AGENT_LAB_CONFIG,
    updatedAt: Date.now(),
  })
}
