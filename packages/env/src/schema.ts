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
  DATA_DIR: z.string().default('./data'),
  BETTER_AUTH_SECRET: z.string().min(1).default('dev-secret-change-me-in-production'),
  BETTER_AUTH_URL: z.string().url().default('https://localhost:3000'),
})

export type ServerEnv = z.infer<typeof ServerEnvSchema>
