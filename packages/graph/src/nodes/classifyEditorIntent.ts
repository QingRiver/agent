import type { EditorChatIntent } from '@agent/protocol'
import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import type { EditorChatStateType } from '../state/editorChatState'
import { EditorChatIntentSchema } from '@agent/protocol'
import { CLASSIFY_INTENT_SYSTEM_PROMPT } from '../prompts/editorPrompts'
import { messageText } from '../utils/messageText'
import { parseLlmJson } from '../utils/parseLlmJson'
import { runChatCompletion } from './chatCompletion'

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

/** 纯判定 + LLM 分类：写入 state.intent */
export async function classifyEditorIntent(
  state: EditorChatStateType,
  config: LangGraphRunnableConfig,
): Promise<{ intent: EditorChatIntent }> {
  const forced = forceIntent(config)
  if (forced)
    return { intent: forced }

  const latestUser = [...state.messages].reverse().find(m => m.getType() === 'human')
  const text = messageText(latestUser)
  if (!text.trim())
    return { intent: 'ask' }

  const byHeuristic = heuristicEditorIntent(text)
  if (byHeuristic)
    return { intent: byHeuristic }

  const raw = await runChatCompletion(undefined, {
    system: CLASSIFY_INTENT_SYSTEM_PROMPT,
    user: text,
    temperature: 0,
    mode: 'silent',
  })
  const parsed = parseLlmJson(raw, EditorChatIntentSchema)
  return { intent: parsed?.intent ?? 'ask' }
}
