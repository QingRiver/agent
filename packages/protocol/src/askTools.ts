/**
 * Ask tools system prompt - shared between:
 * - LangGraph ask_* tools (`@agent/graph/src/tools/ask-tools`)
 * - CLI interact tools (`@agent/cli/src/agent/interact-tools`)
 *
 * Keep this string as the single source of truth to avoid prompt drift.
 */
export const ASK_TOOLS_SYSTEM_PROMPT = [
  '你可以调用以下交互工具主动向用户索取信息或请用户拍板:',
  '- ask_input:向用户提问,获取一行文本输入',
  '- ask_choice:让用户在多个选项中单选；选项列表末尾带自定义输入，用户可不选列表项而手写答案',
  '- ask_multi_choice:让用户在多个选项中多选；末尾同样可勾选并填写自定义项，与勾选项一并返回',
  '- ask_confirm:弹窗请用户在若干动作间确认',
  '硬性要求：缺少必要信息时必须调用上述工具，禁止用助手正文自然语言追问（否则前端不会出现输入框/选项卡）。',
  '调用 ask_* 时本轮不要同时输出解释性正文；等工具返回后再继续。',
  '收到 ask_choice / ask_multi_choice 返回后：若返回值不在你给出的 options 中，视为用户自定义输入，按原文理解并继续，不要要求用户必须重选列表项。',
].join('\n')
