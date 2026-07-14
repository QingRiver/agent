/**
 * 错误兜底消息相关类型与构造。
 *
 * ag-ui 的 Message schema 是 `"strip"`(自定义字段会被 zod parse 丢弃),但 CopilotKit
 * `agent.addMessage` 原样 `this.messages.push(e)` 不走 parse,故运行时自定义字段保留。
 * 注入时 `as Message`(CopilotKit 的联合 Message 类型)一次即可,addMessage 接受。
 */

/** 错误消息扩展字段(挂在 ag-ui AssistantMessage 上,运行时保留) */
export interface AgentErrorFields {
  isError: true
  code: string
  name: string
  json: string
}

/** CopilotKit Message 联合类型的最小形状(addMessage 接受,运行时 push 不校验) */
export interface AgentMessageLike {
  id: string
  role: string
  content?: string
}

/** 注入对话流的错误 assistant 消息(AssistantMessage + 错误扩展字段) */
export type ErrorAssistantMessageData = AgentMessageLike & AgentErrorFields

/** 读 message 上的错误扩展字段(非错误消息或 null/undefined 返回 null) */
export function readErrorFields(message: unknown): AgentErrorFields | null {
  if (message == null || typeof message !== 'object')
    return null
  const m = message as Partial<AgentErrorFields>
  if (m.isError !== true)
    return null
  return {
    isError: true,
    code: typeof m.code === 'string' ? m.code : '',
    name: typeof m.name === 'string' ? m.name : '',
    json: typeof m.json === 'string' ? m.json : '',
  }
}

/**
 * 构造一条错误兜底 assistant 消息(注入 agent.messages → CopilotChat 对话流内渲染)。
 * content = 情绪安抚 + 友好 message + 行动指引。
 */
export function buildErrorMessage(
  friendlyMessage: string,
  fields: { code: string, name: string, json: string },
): ErrorAssistantMessageData {
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: `抱歉，刚才的请求没能处理完成。\n\n${friendlyMessage}\n\n可以点「重新生成」重试，或展开下方详情查看原因。`,
    isError: true,
    code: fields.code,
    name: fields.name,
    json: fields.json,
  }
}
