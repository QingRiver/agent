/**
 * 编辑器相关 system prompt（Ask / classify / writeEdit / summary）。
 *
 * 各段内容从 writing_editor skill 的 refs 同步加载（`@agent/skills/node`），
 * 此处只做组合（constitution + 各模式段 + 动态参数）。改 prompt 即改 ref 文件。
 */
import {
  EDITOR_CONSTITUTION as CONSTITUTION,
  EDITOR_ASK_MODE_RULES,
  EDITOR_CAPABILITIES,
  EDITOR_CLASSIFY_INTENT_PROMPT,
  EDITOR_SUMMARY_RULES,
  EDITOR_WRITE_DOCUMENT_PREFIX,
  EDITOR_WRITE_INLINE_PREFIX,
} from '@agent/skills/node'

export const EDITOR_CONSTITUTION = CONSTITUTION

export const CLASSIFY_INTENT_SYSTEM_PROMPT = EDITOR_CLASSIFY_INTENT_PROMPT

export const EDITOR_ASK_SYSTEM_PROMPT = [EDITOR_CONSTITUTION, '', EDITOR_ASK_MODE_RULES].join('\n')

const EDITOR_CAPS = EDITOR_CAPABILITIES
const CASE_INLINE_PREFIX = EDITOR_WRITE_INLINE_PREFIX
const CASE_DOCUMENT_PREFIX = EDITOR_WRITE_DOCUMENT_PREFIX

export const SUMMARY_SYSTEM_PROMPT = [EDITOR_CONSTITUTION, '', EDITOR_SUMMARY_RULES].join('\n')

export {
  DOCUMENT_ASSISTANT_NOTE,
  DOCUMENT_WRITING_NOTE,
} from '@agent/proto'

export function buildWriteSystemPrompt(params: {
  editCase: 'inline' | 'document'
  instruction: string
  focusTexts: string[]
}): string {
  const casePrefix = params.editCase === 'inline' ? CASE_INLINE_PREFIX : CASE_DOCUMENT_PREFIX
  const parts = [
    EDITOR_CONSTITUTION,
    '',
    EDITOR_CAPS,
    '',
    casePrefix,
  ]
  const instruction = params.instruction.trim()
  if (instruction)
    parts.push('', `用户指令：${instruction}`)
  if (params.focusTexts.length > 0) {
    parts.push('', '请重点处理下列原文片段（按文字匹配定位，不要依赖字符偏移）：')
    params.focusTexts.forEach((t, i) => {
      parts.push(`${i + 1}. 「${t}」`)
    })
  }
  return parts.join('\n')
}
