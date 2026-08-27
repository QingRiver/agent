import type { ReactAgentRuntimeConfig } from '@agent/graph'
import { env } from '@agent/env'
import {
  clampMaxSteps,
  ReactAgentRuntimeConfigSchema,
  sanitizeKbId,
  sanitizeUserPrompt,
} from '@agent/graph'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db/drizzle'
import { agentConfigs } from '../../db/schema'

export interface AgentConfigRecord extends ReactAgentRuntimeConfig {
  id: string
  userId: string
  name: string
  description: string
  skillCodes: string[]
  createdAt: number
  updatedAt: number
}

export interface UpsertAgentConfigInput {
  /** 省略则新建 */
  id?: string | undefined
  name: string
  description?: string | undefined
  userPrompt: string
  kbId: string
  maxSteps: number
  skillCodes?: string[] | undefined
}

const cache = new Map<string, AgentConfigRecord>()

function cacheKey(userId: string, id: string) {
  return `${userId}:${id}`
}

function normalizeSkillCodes(raw: string[] | undefined | null): string[] {
  if (!raw?.length)
    return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const code = item.trim().slice(0, 64)
    if (!code || seen.has(code))
      continue
    seen.add(code)
    out.push(code)
  }
  return out.slice(0, 32)
}

function rowToRecord(row: typeof agentConfigs.$inferSelect): AgentConfigRecord {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    description: row.description,
    userPrompt: row.userPrompt,
    kbId: row.kbId,
    maxSteps: row.maxSteps,
    skillCodes: normalizeSkillCodes(row.skillCodes),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toRuntime(config: Pick<AgentConfigRecord, 'userPrompt' | 'kbId' | 'maxSteps'>): ReactAgentRuntimeConfig {
  return ReactAgentRuntimeConfigSchema.parse({
    userPrompt: sanitizeUserPrompt(config.userPrompt),
    kbId: sanitizeKbId(config.kbId, env.KB_COLLECTION),
    maxSteps: clampMaxSteps(config.maxSteps),
  })
}

/** 鉴权 + 缓存；仅返回属于 userId 的配置 */
export async function loadAgentConfig(
  userId: string,
  id: string,
): Promise<AgentConfigRecord | null> {
  const key = cacheKey(userId, id)
  const hit = cache.get(key)
  if (hit)
    return hit

  const rows = await db
    .select()
    .from(agentConfigs)
    .where(and(eq(agentConfigs.id, id), eq(agentConfigs.userId, userId)))
    .limit(1)
  const row = rows[0]
  if (!row)
    return null
  const record = rowToRecord(row)
  cache.set(key, record)
  return record
}

export function invalidateAgentConfigCache(userId: string, id: string) {
  cache.delete(cacheKey(userId, id))
}

/** Lab / Editor：按 id upsert；无 id 则新建 */
export async function upsertAgentConfig(
  userId: string,
  input: UpsertAgentConfigInput,
): Promise<AgentConfigRecord> {
  const runtime = toRuntime(input)
  const now = Date.now()
  const name = input.name.trim().slice(0, 80) || '未命名 Agent'
  const description = (input.description ?? '').slice(0, 200)
  const skillCodes = normalizeSkillCodes(input.skillCodes)

  if (input.id?.trim()) {
    const id = input.id.trim()
    const existing = await loadAgentConfig(userId, id)
    if (existing) {
      await db
        .update(agentConfigs)
        .set({
          name,
          description,
          userPrompt: runtime.userPrompt,
          kbId: runtime.kbId,
          maxSteps: runtime.maxSteps,
          skillCodes,
          updatedAt: now,
        })
        .where(and(eq(agentConfigs.id, id), eq(agentConfigs.userId, userId)))
      invalidateAgentConfigCache(userId, id)
      const updated: AgentConfigRecord = {
        ...existing,
        name,
        description,
        ...runtime,
        skillCodes,
        updatedAt: now,
      }
      cache.set(cacheKey(userId, id), updated)
      return updated
    }
  }

  const id = crypto.randomUUID()
  const record: AgentConfigRecord = {
    id,
    userId,
    name,
    description,
    ...runtime,
    skillCodes,
    createdAt: now,
    updatedAt: now,
  }
  await db.insert(agentConfigs).values({
    id: record.id,
    userId: record.userId,
    name: record.name,
    description: record.description,
    userPrompt: record.userPrompt,
    kbId: record.kbId,
    maxSteps: record.maxSteps,
    skillCodes: record.skillCodes,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  })
  cache.set(cacheKey(userId, id), record)
  return record
}

/** 装成 resolveConfigurable 消费的 RuntimeBundle（不含 prompt 回写到 agent.state） */
export function toRuntimeBundle(record: AgentConfigRecord): ReactAgentRuntimeConfig {
  return toRuntime(record)
}
