import { sql } from 'drizzle-orm'
import { bigint, index, integer, pgTable, text } from 'drizzle-orm/pg-core'

/** 用户自定义 Agent 运行配置（reactAgent 经 agentConfigId 加载） */
export const agentConfigs = pgTable('agent_configs', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  userPrompt: text('user_prompt').notNull(),
  kbId: text('kb_id').notNull(),
  maxSteps: integer('max_steps').notNull(),
  skillCodes: text('skill_codes').array().notNull().default(sql`'{}'::text[]`),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
}, table => [
  index('idx_agent_configs_user_updated').on(table.userId, table.updatedAt),
])
