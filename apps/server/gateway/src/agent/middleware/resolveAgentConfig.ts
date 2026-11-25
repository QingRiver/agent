import type { ReactAgentRuntimeConfig } from '@agent/graph'
import { env } from '@agent/env'
import {
  clampMaxSteps,
  readAgentConfigId,
  sanitizeKbId,
  sanitizeUserPrompt,
} from '@agent/graph'
import { REACT_AGENT_MAX_STEPS_DEFAULT } from '@agent/graph/react-agent-config'
import { composeBuiltInSkillIndex } from '@agent/skills/node'
import { HTTPException } from 'hono/http-exception'
import { SkillService } from '../../service/skill'
import { loadAgentConfig, toRuntimeBundle } from '../agentConfig/store'

/**
 * 合并用户 skill 索引（懒加载，formatSkillContext）与内置 skill 索引（急切 inline 正文）。
 * 内置 skill（如 html_card 的写作规约）每次运行都在场，不依赖用户 agentConfig 配置。
 */
async function mergeSkillIndex(
  userId: string,
  userSkillCodes: string[],
): Promise<{ skillText: string, skillBindings: unknown[] }> {
  const user = await SkillService.buildIndex(userId, userSkillCodes)
  const builtIn = await composeBuiltInSkillIndex()
  const skillText = [user.skillText, builtIn.skillText]
    .map(s => s.trim())
    .filter(Boolean)
    .join('\n\n')
  const skillBindings = [...user.skillBindings, ...builtIn.skillBindings]
  return { skillText, skillBindings }
}

/**
 * agentConfigId → 可信 load → 图 `configurable`。
 * 无 id 时用默认 prompt / kb，忽略客户端夹带的全文。
 */
export async function resolveReactAgentRun(
  userId: string | undefined,
  configurable: Record<string, unknown> | undefined,
): Promise<{ configurable: Record<string, unknown>, recursionLimit: number }> {
  const agentConfigId = readAgentConfigId(configurable)
  const builtIn = await composeBuiltInSkillIndex()
  if (!agentConfigId) {
    return {
      configurable: {
        userPrompt: sanitizeUserPrompt(undefined),
        kbId: sanitizeKbId(undefined, env.KB_COLLECTION),
        ...(userId ? { userId } : {}),
        ...(builtIn.skillText ? { skillText: builtIn.skillText } : {}),
        ...(builtIn.skillBindings.length > 0 ? { skillBindings: builtIn.skillBindings } : {}),
      },
      recursionLimit: clampMaxSteps(REACT_AGENT_MAX_STEPS_DEFAULT),
    }
  }

  if (!userId)
    throw new HTTPException(401, { message: 'ResolveAgentConfig: missing request userId' })

  const record = await loadAgentConfig(userId, agentConfigId)
  if (!record)
    throw new HTTPException(404, { message: `ResolveAgentConfig: config not found: ${agentConfigId}` })

  const bundle: ReactAgentRuntimeConfig = toRuntimeBundle(record)
  const { skillText, skillBindings } = await mergeSkillIndex(userId, record.skillCodes)
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
