import type { SelectOption, ToolDef } from '@core/types'
import { interact } from '@core/agent-effect'
import { Effect } from 'effect'

// ==========================================
// interact 工具 —— AI 可自行决定调用的人机交互工具
// ==========================================
// 与 defaultConfirmGate 的区别:
//  - interact 工具:AI 主导的开放交互(提问/选择/请用户拍板),risk=safe,不走闸门
//  - confirmGate:框架强制的安全确认(risk≠safe 触发),AI 绕不过
// 两者底层共用 I_UI.interact + 确认区组件,零新增 UI 机制。

const optionsSchema = {
  type: 'array',
  description: '可选项列表',
  items: {
    type: 'object',
    properties: {
      label: { type: 'string', description: '展示文本' },
      value: { type: 'string', description: '选项值' },
      description: { type: 'string', description: '可选的补充说明' },
    },
    required: ['label', 'value'],
  },
} as const

const interactTools: ToolDef[] = [
  {
    schema: {
      type: 'function',
      function: {
        name: 'ask_input',
        description: '向用户提问,获取一行文本输入。当你缺少必要信息时调用,不要自行臆测。',
        parameters: {
          type: 'object',
          properties: {
            message: { type: 'string', description: '要问用户的问题/提示' },
            placeholder: { type: 'string', description: '输入框占位提示(可选)' },
          },
          required: ['message'],
        },
      },
    },
    execute: args => Effect.gen(function* () {
      const message = args.message as string
      const r = yield* interact({
        type: 'input',
        message,
        ...(args.placeholder != null ? { placeholder: args.placeholder as string } : {}),
      })
      return `用户回答:${(r.payload as { value: string }).value}`
    }),
  },
  {
    schema: {
      type: 'function',
      function: {
        name: 'ask_choice',
        description: '让用户在多个选项中单选一个。需要用户从候选中做决定时调用。',
        parameters: {
          type: 'object',
          properties: {
            message: { type: 'string', description: '选择提示语' },
            options: optionsSchema,
          },
          required: ['message', 'options'],
        },
      },
    },
    execute: args => Effect.gen(function* () {
      const message = args.message as string
      const options = args.options as SelectOption[]
      const r = yield* interact({ type: 'select', message, options })
      const value = (r.payload as { value: string }).value
      const opt = options.find(o => o.value === value)
      return `用户选择:${opt?.label ?? value}`
    }),
  },
  {
    schema: {
      type: 'function',
      function: {
        name: 'ask_multi_choice',
        description: '让用户在多个选项中多选。需要用户挑选若干项时调用。',
        parameters: {
          type: 'object',
          properties: {
            message: { type: 'string', description: '选择提示语' },
            options: optionsSchema,
          },
          required: ['message', 'options'],
        },
      },
    },
    execute: args => Effect.gen(function* () {
      const message = args.message as string
      const options = args.options as SelectOption[]
      const r = yield* interact({ type: 'multiSelect', message, options })
      const values = (r.payload as { values: string[] }).values
      const labels = values.map(v => options.find(o => o.value === v)?.label ?? v)
      return `用户选择:${labels.join(', ')}`
    }),
  },
  {
    schema: {
      type: 'function',
      function: {
        name: 'ask_confirm',
        description: '弹窗请用户在若干动作间确认(如选方案、同意/取消)。需要用户拍板时调用。',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '弹窗标题' },
            body: { type: 'string', description: '弹窗正文' },
            actions: { type: 'array', items: { type: 'string' }, description: '可选动作(如["确认","取消"])' },
          },
          required: ['title', 'body', 'actions'],
        },
      },
    },
    execute: args => Effect.gen(function* () {
      const r = yield* interact({
        type: 'modal',
        title: args.title as string,
        body: args.body as string,
        actions: args.actions as string[],
      })
      return `用户选择:${(r.payload as { action: string }).action}`
    }),
  },
]

const INTERACT_SYSTEM_PROMPT = [
  '你可以调用以下交互工具主动向用户索取信息或请用户拍板:',
  '- ask_input:向用户提问,获取一行文本输入',
  '- ask_choice:让用户在多个选项中单选',
  '- ask_multi_choice:让用户在多个选项中多选',
  '- ask_confirm:弹窗请用户在若干动作间确认',
  '当你缺少必要信息、或需要用户做决定时,调用对应工具,不要自行臆测。',
].join('\n')

export { INTERACT_SYSTEM_PROMPT, interactTools }
