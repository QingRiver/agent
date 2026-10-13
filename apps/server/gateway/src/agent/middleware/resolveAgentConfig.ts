import type { ReactAgentRuntimeConfig } from '@agent/graph'
import { env } from '@agent/env'
import {
  clampMaxSteps,
  REACT_AGENT_MAX_STEPS_DEFAULT,
  readAgentConfigId,
  sanitizeKbId,
  sanitizeUserPrompt,
} from '@agent/graph'
import { SkillService } from '../../service/skill'
import { loadAgentConfig, toRuntimeBundle } from '../agentConfig/store'

/**
 * agentConfigId → 可信 load → 图 `configurable`。
 * 无 id 时用默认 prompt / kb，忽略客户端夹带的全文。
 */
export async function resolveReactAgentRun(
  userId: string | undefined,
  configurable: Record<string, unknown> | undefined,
): Promise<{ configurable: Record<string, unknown>, recursionLimit: number }> {
  const agentConfigId = readAgentConfigId(configurable)
  if (!agentConfigId) {
    return {
      configurable: {
        userPrompt: sanitizeUserPrompt(undefined),
        kbId: sanitizeKbId(undefined, env.KB_COLLECTION),
        ...(userId ? { userId } : {}),
      },
      recursionLimit: clampMaxSteps(REACT_AGENT_MAX_STEPS_DEFAULT),
    }
  }

  if (!userId)
    throw new Error('ResolveAgentConfig: missing request userId')

  const record = await loadAgentConfig(userId, agentConfigId)
  if (!record)
    throw new Error(`ResolveAgentConfig: config not found: ${agentConfigId}`)

  const bundle: ReactAgentRuntimeConfig = toRuntimeBundle(record)
  const { skillText, skillBindings } = await SkillService.buildIndex(userId, record.skillCodes)
  return {
    configurable: {
      userPrompt: sanitizeUserPrompt(bundle.userPrompt),
      kbId: sanitizeKbId(bundle.kbId, env.KB_COLLECTION),
      ...(userId ? { userId } : {}),
      ...(skillText ? { skillText } : {}),
      ...(skillBindings.length > 0 ? { skillBindings } : {}),
    },
    recursionLimit: clampMaxSteps(bundle.maxSteps),
  }
}
