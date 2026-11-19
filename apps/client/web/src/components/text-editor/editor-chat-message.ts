import {
  DOCUMENT_ASSISTANT_NOTE,
  DOCUMENT_WRITING_NOTE,
} from '@agent/proto'

function isAllowedAssistantNote(content: string): boolean {
  const t = content.trim()
  return t === DOCUMENT_WRITING_NOTE
    || t === '编写中'
    || t === DOCUMENT_ASSISTANT_NOTE
    || t.startsWith('缺少')
    || t.startsWith('未能生成')
    || t.includes('补丁')
}

/**
 * 会话级过滤器：隐藏 write 流式 dump / polished 全文，只留短说明。
 * 勿用模块单例——多编辑器实例会互相污染。
 */
export function createEditorChatTextFilter() {
  let suppressDocumentDump = false
  const hiddenPolishedTexts = new Set<string>()

  return {
    setSuppressDocumentDump(suppress: boolean) {
      suppressDocumentDump = suppress
    },
    hidePolishedText(polished: string) {
      const t = polished.trim()
      if (t)
        hiddenPolishedTexts.add(t)
    },
    clear() {
      suppressDocumentDump = false
      hiddenPolishedTexts.clear()
    },
    shouldHide(content: string): boolean {
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
      if (suppressDocumentDump)
        return true
      return false
    },
  }
}

export type EditorChatTextFilter = ReturnType<typeof createEditorChatTextFilter>
