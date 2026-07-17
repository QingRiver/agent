import { z } from 'zod'
import { LEAF_OP_TEXT, LOGIC_OP_TEXT } from './filter'
import {
  formatFilterMatrixMarkdown,
  PERSPECTIVE_INPUT_ERROR_CODE,
  RELATIVE_DATE_LITERALS,
} from './perspective-input'
import {
  AVAILABILITY_FILTER_TEXT,
  FILTER_FIELD_TEXT,
} from './types'

const relativeDateTokenList = RELATIVE_DATE_LITERALS.map(t => `\`${t}\``).join('、')

/** 浏览器安全：内联模板，不依赖 node:fs */
export const PERSPECTIVE_PROMPT_TEMPLATE = `# GTD 自定义透视（Perspective）Agent 指南

你是 GTD 任务查询助手。通过结构化透视参数过滤、分组和排序任务。

## Query 与 Upsert 的区别

- **Query（\`gtd_query_tasks\`）**：一次性查询，不写入文档。可使用**相对日期** token。
- **Upsert（\`gtd_upsert_perspective\`）**：创建或更新持久自定义透视。**仅接受绝对 ISO 日期**，相对 token 会被拒绝。

## 工作流

1. 先调用 \`gtd_list_context\` 获取当前用户的 projects、folders、tags、perspectives。
2. 使用返回的 **id 或精确 name** 构造过滤树；**禁止编造 UUID**。
3. 收到结构化 \`errors\` 后按 \`code\` 修正并重试。

## 可用性范围（availabilityFilter）

${Object.entries(AVAILABILITY_FILTER_TEXT).map(([k, v]) => `- \`${k}\`：${v}`).join('\n')}

## 过滤树（filter）

\`filter\` 为可嵌套 JSON 树，节点用 \`op\` 判别：

- **逻辑节点**：\`{op:'and'|'or', children:[...]}\`、\`{op:'not', child:{...}}\`
- **叶子节点**：\`{op:<LeafOp>, field:<FilterField>, value?:...}\`

逻辑操作符：

${Object.entries(LOGIC_OP_TEXT).map(([k, v]) => `- \`${k}\`：${v}`).join('\n')}

叶子操作符：

${Object.entries(LEAF_OP_TEXT).map(([k, v]) => `- \`${k}\`：${v}`).join('\n')}

约束：深度 ≤ 5、节点数 ≤ 32。\`filter\` 可为 \`null\` 表示无过滤。

## 分组与排序

1. 先按 \`groupBy\` 多级分组（tag 一任务可进多组）
2. 组内按 \`sortBy\` 多级排序（null 值排末尾）

## 过滤矩阵

\${filter_matrix}

## 字段中文

${Object.entries(FILTER_FIELD_TEXT).map(([k, v]) => `- \`${k}\`：${v}`).join('\n')}

## 相对日期（仅 Query）

支持 token：${relativeDateTokenList}、\`+Nd\`/ \`-Nd\`、\`+Nw\`/ \`-Nw\`。

持久透视请使用 \`{ "type": "absolute", "value": "<ISO8601>" }\`。

## 错误码

${Object.values(PERSPECTIVE_INPUT_ERROR_CODE).map(code => `- \`${code}\``).join('\n')}

## 示例

\${examples}
`.trim()

const TEMPLATE_VAR_REGEX = /\$\{([^}]+)\}/g

const PerspectivePromptVarsSchema = z.object({
  filter_matrix: z.string().min(1),
  examples: z.string().min(1),
})

export type PerspectivePromptVars = z.infer<typeof PerspectivePromptVarsSchema>

export function renderPerspectivePrompt(vars: PerspectivePromptVars): string {
  const parsed = PerspectivePromptVarsSchema.parse(vars)
  return PERSPECTIVE_PROMPT_TEMPLATE.replace(
    TEMPLATE_VAR_REGEX,
    (_, name: string) => parsed[name as keyof PerspectivePromptVars],
  )
}

export function renderPerspectivePromptWithDefaults(
  examples: string,
): string {
  return renderPerspectivePrompt({
    filter_matrix: formatFilterMatrixMarkdown(),
    examples,
  })
}

/** 从 prompts/perspective.md 同构的占位符名（供 server 模块对齐） */
export const PERSPECTIVE_PROMPT_VARIABLES = ['filter_matrix', 'examples'] as const
