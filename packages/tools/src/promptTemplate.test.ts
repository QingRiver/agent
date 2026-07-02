/* eslint-disable no-template-curly-in-string -- 整文件都在测 ${var} 占位符字面量 */
import { describe, expect, it } from 'vitest'
import { createSchemaFromPrompt, extractTemplateVariables, renderPrompt } from './promptTemplate'

describe('createSchemaFromPrompt', () => {
  it('解析 ${var} 占位符（去重、保序）', () => {
    expect(extractTemplateVariables('今天 ${to_day}，明天 ${to_day}，城市 ${city}'))
      .toEqual(['to_day', 'city'])
    expect(extractTemplateVariables('无占位符')).toEqual([])
  })

  it('为每个占位符生成必填 string schema', () => {
    const { schema, variables } = createSchemaFromPrompt('${a} ${b}')
    expect(variables).toEqual(['a', 'b'])
    expect(schema.parse({ a: '1', b: '2' })).toEqual({ a: '1', b: '2' })
  })

  it('缺项抛 ZodError，path 指向缺失的变量名', () => {
    const { schema } = createSchemaFromPrompt('${to_day}')
    const result = schema.safeParse({})
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.issues[0]!.path).toContain('to_day')
  })
})

describe('renderPrompt', () => {
  it('替换全部同名占位符', () => {
    expect(renderPrompt('${to_day} 与 ${to_day}', { to_day: '20260701' }))
      .toBe('20260701 与 20260701')
  })

  it('缺项抛错（不静默漏替换）', () => {
    expect(() => renderPrompt('${to_day} ${city}', { to_day: '20260701' }))
      .toThrow()
  })
})
