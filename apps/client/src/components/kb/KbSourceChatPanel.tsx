import type { EditorWriteProposal } from '@components/text-editor/EditorChatPanel'
import { EditorChatPanel } from '@components/text-editor/EditorChatPanel'
import { KbStore } from '@stores/kb-store'
import { getDefaultStore } from 'jotai'

/** 知识库源码模式右侧 AI：复用 editor 图 chat 路径，读写 KbStore 正文 */
export function KbSourceChatPanel() {
  function getDocument() {
    return getDefaultStore().get(KbStore.activeDocAtom)?.content ?? ''
  }

  function onApplyProposal(proposal: EditorWriteProposal) {
    const store = getDefaultStore()
    const doc = store.get(KbStore.activeDocAtom)
    if (!doc)
      return false
    if (doc.content !== proposal.baseline)
      return false
    const polished = proposal.polished.trim()
    if (!polished)
      return false
    KbStore.updateLocalContent(proposal.polished)
    return true
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-3 py-2">
        <span className="text-sm font-medium text-foreground">写作对话</span>
        <p className="mt-0.5 text-xs text-muted-foreground">源码模式 · 修改将直接写入当前文档</p>
      </div>
      <div className="min-h-0 flex-1">
        <EditorChatPanel
          quotes={[]}
          onRemoveQuote={() => {}}
          onConsumeQuotes={() => []}
          getDocument={getDocument}
          onApplyProposal={onApplyProposal}
        />
      </div>
    </div>
  )
}
