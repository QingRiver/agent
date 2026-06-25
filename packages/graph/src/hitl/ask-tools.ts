/**
 * ask_* 中断工具 —— AI 可自行调用的人机交互工具（langgraph 版）。
 *
 * 与 CLI `packages/cli/src/agent/interact-tools.ts` 同名同 schema、同语义:
 * 工具内 `interrupt()` 抛 GraphInterrupt 暂停图(checkpoint 落盘),外部 `Command({resume})`
 * 的值成为 `interrupt()` 返回值,工具继续执行返回结果字符串 → ToolNode 自动包成 ToolMessage。
 *
 * 中断 payload 用 @agent/protocol 的 InterruptRequest 形状(去掉 interruptId——langgraph
 * 自动生成 task interrupt id),由 stream 层 `mapInterruptPayloadToAgUi` 适配为 AG-UI Interrupt。
 *
 * ToolNode 原生支持 tool 内 interrupt:见 `@langchain/langgraph` ToolNode `runTool` 对
 * GraphInterrupt 识别后向上抛(tool_node.cjs)。
 */
import { tool } from '@langchain/core/tools'
import { interrupt } from '@langchain/langgraph'
import { z } from 'zod'

/**
 * 中断 payload 形状与 @agent/protocol 的 InterruptRequest 各分支同构(去掉 interruptId)。
 * 此处内联类型而非直接用 protocol,以避开 zod optional 推断与 exactOptionalPropertyTypes
 * 的摩擦;stream 层 mapInterruptPayloadToAgUi 收到的是 unknown payload,不强校验 protocol 类型。
 */
interface AskOption { label: string, value: string, description?: string | undefined }

const optionsSchema = z.array(z.object({
  label: z.string().describe('展示文本'),
  value: z.string().describe('选项值'),
  description: z.string().optional().describe('可选的补充说明'),
}))

/** ask_input: 向用户提问,获取一行文本输入 */
const askInput = tool(
  async ({ message, placeholder }) => {
    const resp = interrupt<{ type: 'input', message: string, placeholder?: string }, { value: string }>({
      type: 'input',
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

/** ask_choice: 让用户在多个选项中单选一个 */
const askChoice = tool(
  async ({ message, options }) => {
    const resp = interrupt<{ type: 'select', message: string, options: AskOption[] }, { value: string }>({
      type: 'select',
      message,
      options,
    })
    const opt = options.find(o => o.value === resp.value)
    return `用户选择：${opt?.label ?? resp.value}`
  },
  {
    name: 'ask_choice',
    description: '让用户在多个选项中单选一个。需要用户从候选中做决定时调用。',
    schema: z.object({
      message: z.string().describe('选择提示语'),
      options: optionsSchema.describe('可选项列表'),
    }),
  },
)

/** ask_multi_choice: 让用户在多个选项中多选 */
const askMultiChoice = tool(
  async ({ message, options }) => {
    const resp = interrupt<{ type: 'multiSelect', message: string, options: AskOption[] }, { values: string[] }>({
      type: 'multiSelect',
      message,
      options,
    })
    const labels = resp.values.map(v => options.find(o => o.value === v)?.label ?? v)
    return `用户选择：${labels.join(', ')}`
  },
  {
    name: 'ask_multi_choice',
    description: '让用户在多个选项中多选。需要用户挑选若干项时调用。',
    schema: z.object({
      message: z.string().describe('选择提示语'),
      options: optionsSchema.describe('可选项列表'),
    }),
  },
)

/** ask_confirm: 弹窗请用户在若干动作间确认 */
const askConfirm = tool(
  async ({ title, body, actions }) => {
    const resp = interrupt<{ type: 'modal', title: string, body: string, actions: string[] }, { action: string }>({
      type: 'modal',
      title,
      body,
      actions,
    })
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

/** 所有 ask_* 中断工具,供图 bindTools 使用 */
export const ASK_TOOLS = [askInput, askChoice, askMultiChoice, askConfirm]

/** 引导 AI 使用 ask_* 的 system prompt 片段(仿 CLI INTERACT_SYSTEM_PROMPT) */
export const ASK_SYSTEM_PROMPT = [
  '你可以调用以下交互工具主动向用户索取信息或请用户拍板:',
  '- ask_input:向用户提问,获取一行文本输入',
  '- ask_choice:让用户在多个选项中单选',
  '- ask_multi_choice:让用户在多个选项中多选',
  '- ask_confirm:弹窗请用户在若干动作间确认',
  '当你缺少必要信息、或需要用户做决定时,调用对应工具,不要自行臆测。',
].join('\n')
