import { z } from 'zod'

const TEMPLATE_VAR_REGEX = /\$\{([^}]+)\}/g

/** 从模板文本解析所有 ${variable} 占位符（去重、保序） */
export function extractTemplateVariables(prompt: string): string[] {
  const variables: string[] = []
  for (const match of prompt.matchAll(TEMPLATE_VAR_REGEX)) {
    const name = match[1]!
    if (!variables.includes(name))
      variables.push(name)
  }
  return variables
}

/**
 * 根据 Prompt 模板动态生成 Zod Schema：每个 ${variable} 视为必填 string。
 * 渲染前用此 schema 校验传入变量，缺项即抛 ZodError，避免静默漏替换。
 */
export function createSchemaFromPrompt(prompt: string) {
  const variables = extractTemplateVariables(prompt)
  const shape: Record<string, z.ZodString> = {}
  for (const varName of variables) {
    shape[varName] = z.string({
      message: `缺少模板变量: \${${varName}}`,
    })
  }
  return { schema: z.object(shape), variables }
}

/** 校验变量并渲染模板：把 ${var} 替换为对应值，缺项抛 ZodError */
export function renderPrompt(template: string, vars: Record<string, string>): string {
  const { schema } = createSchemaFromPrompt(template)
  schema.parse(vars)
  return template.replace(TEMPLATE_VAR_REGEX, (_, name) => vars[name]!)
}
