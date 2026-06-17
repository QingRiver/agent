import { describe, expect, it } from 'vitest'
import { ServerEnvSchema } from './schema'

describe('serverEnvSchema', () => {
  it('缺少 OPENAI_API_KEY 时校验失败', () => {
    const result = ServerEnvSchema.safeParse({
      OPENAI_BASE_URL: 'https://api.deepseek.com',
    })
    expect(result.success).toBe(false)
  })

  it('合法配置通过校验并填充默认值', () => {
    const result = ServerEnvSchema.safeParse({
      OPENAI_API_KEY: 'sk-test',
      OPENAI_BASE_URL: 'https://api.deepseek.com',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.OPENAI_MODEL).toBe('deepseek-v4-flash')
      expect(result.data.PORT).toBe(3000)
      expect(result.data.DATA_DIR).toBe('./data')
    }
  })
})
