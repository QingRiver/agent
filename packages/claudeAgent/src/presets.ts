import type { Options } from './sdk'

/** 规划/探索阶段常用只读工具 */
export const READ_ONLY_TOOLS = ['Read', 'Grep', 'Glob', 'Bash'] as const

/** 严格只读：plan 模式 + 禁用写工具 */
export function readOnlyOptions(overrides: Partial<Options> = {}): Options {
  return {
    permissionMode: 'plan',
    allowedTools: [...READ_ONLY_TOOLS],
    disallowedTools: ['Write', 'Edit', 'NotebookEdit'],
    ...overrides,
  }
}
