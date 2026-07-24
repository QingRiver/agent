/**
 * ask_* 中断工具 —— AI 可自行调用的人机交互工具（langgraph 版）。
 *
 * 与 CLI `packages/cli/src/agent/interact-tools.ts` 同名同 schema、同语义。
 * 工具内通过 `hitl*` helpers 调用 `interrupt()`；resume 后返回字符串 → ToolMessage。
 */
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import {
  hitlInput,
  hitlModal,
  hitlMultiSelect,
  hitlSelect,
} from './hitl/interrupt'

const optionsSchema = z.array(z.object({
  label: z.string().describe('展示文本'),
  value: z.string().describe('选项值'),
  description: z.string().optional().describe('可选的补充说明'),
}))

const askInput = tool(
  async ({ message, placeholder }) => {
    const resp = await hitlInput({
      message,
      ...(placeholder != null ? { placeholder } : {}),
    })
    return `用户回答：${resp.value}`
  },
  {
    name: 'ask_input',
    description: '向用户提问,获取一行文本输入。当你缺少必要信息时调用,不要自行臆测。',
    schema: z.object({
      message: z.string().describe('要问用户的问题/提示'),
      placeholder: z.string().optional().describe('输入框占位提示(可选)'),
    }),
  },
)

const askChoice = tool(
  async ({ message, options }) => {
    const resp = await hitlSelect({ message, options })
    const opt = options.find(o => o.value === resp.value)
    return `用户选择：${opt?.label ?? resp.value}`
  },
  {
    name: 'ask_choice',
    description:
      '让用户在多个选项中单选一个；UI 末尾另有自定义输入，用户也可填入不在列表中的任意文本。需要用户从候选中做决定、或允许其手写答案时调用。',
    schema: z.object({
      message: z.string().describe('选择提示语'),
      options: optionsSchema.describe('可选项列表（用户仍可通过末尾输入框自定义）'),
    }),
  },
)

const askMultiChoice = tool(
  async ({ message, options }) => {
    const resp = await hitlMultiSelect({ message, options })
    const labels = resp.values.map(v => options.find(o => o.value === v)?.label ?? v)
    return `用户选择：${labels.join(', ')}`
  },
  {
    name: 'ask_multi_choice',
    description:
      '让用户在多个选项中多选；UI 末尾另有与选项对齐的自定义输入，可与勾选项一并提交。需要用户挑选若干项、或允许补充手写项时调用。',
    schema: z.object({
      message: z.string().describe('选择提示语'),
      options: optionsSchema.describe('可选项列表（用户仍可通过末尾输入框追加自定义项）'),
    }),
  },
)

const askConfirm = tool(
  async ({ title, body, actions }) => {
    const resp = await hitlModal({ title, body, actions })
    return `用户选择：${resp.action}`
  },
  {
    name: 'ask_confirm',
    description: '弹窗请用户在若干动作间确认(如选方案、同意/取消)。需要用户拍板时调用。',
    schema: z.object({
      title: z.string().describe('弹窗标题'),
      body: z.string().describe('弹窗正文'),
      actions: z.array(z.string()).describe('可选动作(如["确认","取消"])'),
    }),
  },
)

export const ASK_TOOLS = [askInput, askChoice, askMultiChoice, askConfirm]

export const ASK_SYSTEM_PROMPT = [
  '你可以调用以下交互工具主动向用户索取信息或请用户拍板:',
  '- ask_input:向用户提问,获取一行文本输入',
  '- ask_choice:让用户在多个选项中单选；选项列表末尾带自定义输入，用户可不选列表项而手写答案',
  '- ask_multi_choice:让用户在多个选项中多选；末尾同样可勾选并填写自定义项，与勾选项一并返回',
  '- ask_confirm:弹窗请用户在若干动作间确认',
  '硬性要求：缺少必要信息时必须调用上述工具，禁止用助手正文自然语言追问（否则前端不会出现输入框/选项卡）。',
  '调用 ask_* 时本轮不要同时输出解释性正文；等工具返回后再继续。',
  '收到 ask_choice / ask_multi_choice 返回后：若返回值不在你给出的 options 中，视为用户自定义输入，按原文理解并继续，不要要求用户必须重选列表项。',
].join('\n')
