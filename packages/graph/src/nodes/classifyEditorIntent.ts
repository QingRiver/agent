import type { EditorChatIntent } from '@agent/proto'
import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import type { EditorChatStateType } from '../state/editorChatState'
import { EditorChatIntentSchema } from '@agent/proto'
import { Command } from '@langchain/langgraph'
import { CLASSIFY_INTENT_SYSTEM_PROMPT } from '../prompts/editorPrompts'
import { lastHumanMessageText } from '../utils/messageText'
import { structuredCompletion } from '../utils/structuredCompletion'

export type EditorIntentRoute = 'writeEdit' | 'chatbot'

/** 明显的改稿意图（避免 reasoning 模型 content 为空时误判为 ask） */
export function heuristicEditorIntent(text: string): 'ask' | 'write' | null {
  const t = text.trim()
  if (!t)
    return null
  if (/润色|改写|扩写|缩写|展开说明|展开一下|续写|纠错|改成|改为|生成修改|更正式|更口语|精简|压缩/.test(t))
    return 'write'
  if (/什么意思|为什么|优缺点|怎么看|解释一下|是什么|如何理解|有何建议/.test(t))
    return 'ask'
  return null
}

function forceIntent(config: LangGraphRunnableConfig): EditorChatIntent | null {
  const raw = config.configurable?.forceIntent
  return raw === 'ask' || raw === 'write' ? raw : null
}

function gotoForIntent(intent: EditorChatIntent): EditorIntentRoute {
  return intent === 'write' ? 'writeEdit' : 'chatbot'
}

/** 纯判定 + LLM 分类：写入 state.intent，并用 Command 分流 */
export async function classifyEditorIntent(
  state: EditorChatStateType,
  config: LangGraphRunnableConfig,
): Promise<Command<unknown, { intent: EditorChatIntent }, EditorIntentRoute>> {
  const forced = forceIntent(config)
  if (forced) {
    return new Command({
      update: { intent: forced },
      goto: gotoForIntent(forced),
    })
  }

  const text = lastHumanMessageText(state.messages)
  if (!text) {
    return new Command({
      update: { intent: 'ask' },
      goto: 'chatbot',
    })
  }

  const byHeuristic = heuristicEditorIntent(text)
  if (byHeuristic) {
    return new Command({
      update: { intent: byHeuristic },
      goto: gotoForIntent(byHeuristic),
    })
  }

  const parsed = await structuredCompletion({
    system: CLASSIFY_INTENT_SYSTEM_PROMPT,
    user: text,
    schema: EditorChatIntentSchema,
    temperature: 0,
  })
  const intent = parsed?.intent ?? 'ask'
  return new Command({
    update: { intent },
    goto: gotoForIntent(intent),
  })
}

export const CLASSIFY_INTENT_ENDS = ['chatbot', 'writeEdit'] as const satisfies readonly EditorIntentRoute[]
