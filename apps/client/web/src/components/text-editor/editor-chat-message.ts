/** 与 packages/graph 文案对齐 */
export const EDITOR_CHAT_WRITING_NOTE = '编写中…'
export const EDITOR_CHAT_WRITE_NOTE = '已生成修订建议，请在正文中审阅红绿预览。'

/** 对话 write 期间：隐藏全文改稿气泡（保留「编写中…」与最终短说明） */
let suppressDocumentDump = false

/** CUSTOM 到达后精确隐藏 polished 全文 */
const hiddenPolishedTexts = new Set<string>()

export function setEditorChatSuppressDocumentDump(suppress: boolean): void {
  suppressDocumentDump = suppress
}

export function hideEditorChatPolishedText(polished: string): void {
  const t = polished.trim()
  if (t)
    hiddenPolishedTexts.add(t)
}

function isAllowedAssistantNote(content: string): boolean {
  const t = content.trim()
  if (t === EDITOR_CHAT_WRITING_NOTE || t === '编写中')
    return true
  if (t === EDITOR_CHAT_WRITE_NOTE || t.startsWith('已生成修订建议'))
    return true
  if (t.startsWith('缺少') || t.startsWith('未能生成'))
    return true
  return false
}

/** 意图 JSON / summaries JSON / 全文改稿等不应展示的助手内容 */
export function isEditorChatInternalAssistantContent(content: string): boolean {
  const t = content.trim()
  if (!t)
    return true
  if (isAllowedAssistantNote(t))
    return false
  if (t.startsWith('{') && /"(?:summaries|intent)"\s*:/.test(t))
    return true
  if (hiddenPolishedTexts.has(t))
    return true
  for (const p of hiddenPolishedTexts) {
    if (p.startsWith(t) && t.length >= 8)
      return true
  }
  // write 期间：隐藏任意正文 dump（含流式前几个字），只留上面的允许短说明
  if (suppressDocumentDump)
    return true
  return false
}
