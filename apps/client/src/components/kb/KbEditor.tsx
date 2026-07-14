import { Button } from '@components/ui/button'
import { useKbDocuments } from '@hooks/useKbDocuments'
import { isDocDirty } from '@stores/kb-store'
import { FilePlus, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { KbMarkdownEditor } from './KbMarkdownEditor'
import { KbMarkdownPreview } from './KbMarkdownPreview'

type ViewMode = 'edit' | 'split' | 'preview'

export function KbEditor() {
  const {
    activeDoc,
    saving,
    committing,
    error,
    localDirty,
    updateLocalContent,
    updateLocalName,
    saveDraft,
    commit,
    createBlank,
  } = useKbDocuments()

  const [mode, setMode] = useState<ViewMode>('edit')
  const [busy, setBusy] = useState(false)

  const dirty = activeDoc
    ? localDirty || isDocDirty(activeDoc)
    : false

  const onSave = useCallback(async () => {
    if (!activeDoc || saving || committing)
      return
    setBusy(true)
    try {
      await saveDraft()
    }
    catch {
      // store 已记 error
    }
    finally {
      setBusy(false)
    }
  }, [activeDoc, saving, committing, saveDraft])

  const onCommit = useCallback(async () => {
    if (!activeDoc || saving || committing)
      return
    setBusy(true)
    try {
      await commit()
    }
    catch {
      // store 已记 error
    }
    finally {
      setBusy(false)
    }
  }, [activeDoc, saving, committing, commit])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey
      if (!meta)
        return
      if (e.key === 's') {
        e.preventDefault()
        void onSave()
      }
      else if (e.key === 'Enter') {
        e.preventDefault()
        void onCommit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSave, onCommit])

  if (!activeDoc) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-slate-400">
        <p className="text-sm">从左侧选择文档，或新建一篇</p>
        <Button
          type="button"
          variant="outline"
          onClick={() => void createBlank()}
          className="gap-2"
        >
          <FilePlus className="size-4" />
          新建文档
        </Button>
      </div>
    )
  }

  const statusLabel = (() => {
    if (committing)
      return '提交中…'
    if (saving)
      return '保存中…'
    if (activeDoc.indexingStatus === 'error')
      return `错误：${activeDoc.error ?? '提交失败'}`
    if (activeDoc.indexingStatus === 'indexing')
      return '索引中…'
    if (dirty)
      return '未提交'
    if (activeDoc.indexingStatus === 'completed')
      return '已提交'
    return '草稿'
  })()

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
        <input
          value={activeDoc.name}
          onChange={e => updateLocalName(e.target.value)}
          className="min-w-[8rem] flex-1 rounded-md border border-slate-800 bg-transparent px-2 py-1.5 text-base font-medium text-slate-100 outline-none focus:border-slate-600"
        />
        {activeDoc.vdir && (
          <span className="max-w-[40%] truncate text-xs text-slate-500" title={activeDoc.vdir}>
            {activeDoc.vdir}
          </span>
        )}
        <span className={`text-xs ${dirty ? 'text-amber-400' : 'text-slate-500'}`}>
          {statusLabel}
        </span>
        <div className="flex items-center gap-1 rounded-md border border-slate-800 p-0.5">
          {(['edit', 'split', 'preview'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded px-2 py-1 text-xs ${
                mode === m ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {m === 'edit' ? '编辑' : m === 'split' ? '分屏' : '预览'}
            </button>
          ))}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={saving || committing || busy}
          onClick={() => void onSave()}
        >
          {(saving || busy) && !committing ? <Loader2 className="size-3.5 animate-spin" /> : null}
          保存
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={saving || committing || busy}
          onClick={() => void onCommit()}
        >
          {committing ? <Loader2 className="size-3.5 animate-spin" /> : null}
          提交
        </Button>
      </div>

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      <div className={`min-h-0 flex-1 ${mode === 'split' ? 'grid grid-cols-2 gap-3' : 'flex flex-col'}`}>
        {(mode === 'edit' || mode === 'split') && (
          <KbMarkdownEditor
            key={activeDoc.id}
            docId={activeDoc.id}
            value={activeDoc.content}
            onChange={updateLocalContent}
          />
        )}
        {(mode === 'preview' || mode === 'split') && (
          <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-slate-800 bg-slate-950/40">
            <KbMarkdownPreview content={activeDoc.content} className="h-full" />
          </div>
        )}
      </div>
    </div>
  )
}
