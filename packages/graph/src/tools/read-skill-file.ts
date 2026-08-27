import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import {
  READ_SKILL_FILE_TOOL_NAME,
  readSkillFile,
  resolveBoundSkillCode,
  SKILL_ENTRY_FILENAME,
} from '@agent/proto'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'

export type SkillFileLoader = (args: {
  userId: string
  skillCode: string
}) => Promise<Record<string, string> | null>

let skillFileLoader: SkillFileLoader | null = null

/** gateway 启动时注入；函数本身不进 checkpoint */
export function setSkillFileLoader(loader: SkillFileLoader | null): void {
  skillFileLoader = loader
}

export interface SkillBinding {
  code: string
  name?: string
  strategy: 'latest'
}

function readSkillRuntime(config: LangGraphRunnableConfig): {
  userId: string | undefined
  skillBindings: SkillBinding[]
} {
  const configurable = config?.configurable as {
    userId?: unknown
    skillBindings?: unknown
  } | undefined
  const userId = typeof configurable?.userId === 'string' ? configurable.userId : undefined
  const raw = configurable?.skillBindings
  const skillBindings: SkillBinding[] = []
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item != null && typeof item === 'object' && typeof (item as SkillBinding).code === 'string') {
        const name = (item as { name?: unknown }).name
        skillBindings.push({
          code: (item as SkillBinding).code,
          ...(typeof name === 'string' && name.trim() ? { name: name.trim() } : {}),
          strategy: 'latest',
        })
      }
    }
  }
  return { userId, skillBindings }
}

export const readSkillFileTool = tool(
  async ({ skill_code, path }, config) => {
    const { userId, skillBindings } = readSkillRuntime(config)
    if (!userId)
      return '错误：SKILL_NOT_BOUND（缺少 userId）'
    const boundCode = resolveBoundSkillCode(skill_code, skillBindings)
    if (!boundCode)
      return `错误：SKILL_NOT_BOUND（未绑定 ${skill_code}）`
    if (!skillFileLoader)
      return '错误：SKILL_NOT_BOUND（未配置加载器）'
    const files = await skillFileLoader({ userId, skillCode: boundCode })
    return readSkillFile(files, path)
  },
  {
    name: READ_SKILL_FILE_TOOL_NAME,
    description:
      '读取已绑定 skill 工作区中的文本文件。默认 path 为 SKILL.md。'
      + '仅在需要某 skill 的正文或附属文件时调用；不要猜测未读文件的内容。',
    schema: z.object({
      skill_code: z.string().describe('已绑定 skill 的 code（skill_code= 后的标识）；唯一显示名也可'),
      path: z.string().optional().describe(`相对 skill 根的 posix 路径，默认 ${SKILL_ENTRY_FILENAME}`),
    }),
  },
)
