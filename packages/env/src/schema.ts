import { z } from 'zod'

const LlmEnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY 未设置'),
  OPENAI_BASE_URL: z.string().url('OPENAI_BASE_URL 须为合法 URL'),
  OPENAI_MODEL: z.string().default('deepseek-v4-flash'),
  OPENAI_MODEL_MINI: z.string().optional(),
})

/** monorepo 统一环境变量 */
export const ServerEnvSchema = LlmEnvSchema.extend({
  ANTHROPIC_AUTH_TOKEN: z.string().optional(),
  ANTHROPIC_BASE_URL: z.string().url().optional(),
  ANTHROPIC_MODEL: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  DATA_DIR: z.string().default('apps/server/data'),
  BETTER_AUTH_SECRET: z.string().min(1).default('dev-secret-change-me-in-production'),
  BETTER_AUTH_URL: z.string().url().default('https://localhost:3000'),
  // PostgreSQL（infra/postgres/）：better-auth + drizzle + langgraph checkpoint 共用
  DATABASE_URL: z.string().url('DATABASE_URL 须为合法 postgres 连接串'),
  POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
  TUSHARE_TOKEN: z.string().min(1).optional(),
  QDRANT_URL: z.string().url().default('http://localhost:6333'),
  SILICONFLOW_API_KEY: z.string().min(1).optional(),
  SILICONFLOW_BASE_URL: z.string().url().default('https://api.siliconflow.cn'),
  KB_EMBEDDING_MODEL: z.string().default('BAAI/bge-m3'),
  KB_RERANK_MODEL: z.string().default('BAAI/bge-reranker-v2-m3'),
  KB_MARKITDOWN_URL: z.string().url().default('http://localhost:8200'),
  KB_COLLECTION: z.string().default('kb_default'),
  KB_RECALL_K: z.coerce.number().int().positive().default(20),
  KB_RERANK_TOPK: z.coerce.number().int().positive().default(5),
  KB_RERANK_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.3),
})

export type ServerEnv = z.infer<typeof ServerEnvSchema>
