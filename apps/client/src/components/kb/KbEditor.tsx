import { Button } from '@components/ui/button'
import { useKbDocuments } from '@hooks/useKbDocuments'
import { isDocDirty } from '@stores/kb-store'
import { FilePlus, Loader2, Plus, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { KbMarkdownEditor } from './KbMarkdownEditor'
import { KbMarkdownPreview } from './KbMarkdownPreview'

type ViewMode = 'edit' | 'split' | 'preview'

export function KbEditor() {
  const {
    activeDoc,
    tags: allTags,
    saving,
    committing,
    error,
    localDirty,
    updateLocalContent,
    updateLocalName,
    saveDraft,
    updateMeta,
    commit,
    createBlank,
  } = useKbDocuments()

  const [mode, setMode] = useState<ViewMode>(() => {
    const saved = (typeof localStorage !== 'undefined' && localStorage.getItem('kb.editorMode')) as ViewMode | null
    return saved === 'edit' || saved === 'split' || saved === 'preview' ? saved : 'edit'
  })

  function changeMode(m: ViewMode) {
    setMode(m)
    try {
      localStorage.setItem('kb.editorMode', m)
    }
    catch { /* ignore */ }
  }
  const [busy, setBusy] = useState(false)
  const [tagInput, setTagInput] = useState('')

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

  const onAddTag = useCallback(async () => {
    if (!activeDoc)
      return
    const name = tagInput.trim()
    if (!name)
      return
    const next = [...new Set([...(activeDoc.tags ?? []), name])]
    setTagInput('')
    try {
      await updateMeta(activeDoc.id, { tags: next })
    }
    catch {
      // store 已记 error
    }
  }, [activeDoc, tagInput, updateMeta])

  const onRemoveTag = useCallback(async (tag: string) => {
    if (!activeDoc)
      return
    const next = (activeDoc.tags ?? []).filter(t => t !== tag)
    try {
      await updateMeta(activeDoc.id, { tags: next })
    }
    catch {
      // store 已记 error
    }
  }, [activeDoc, updateMeta])

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
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
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
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <input
          value={activeDoc.name}
          onChange={e => updateLocalName(e.target.value)}
          className="min-w-[8rem] flex-1 rounded-md border border-border bg-transparent px-2 py-1.5 text-base font-medium text-foreground outline-none focus:border-border"
        />
        {activeDoc.vdir && (
          <span className="max-w-[40%] truncate text-xs text-muted-foreground" title={activeDoc.vdir}>
            {activeDoc.vdir}
          </span>
        )}
        <span className={`text-xs ${dirty ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>
          {statusLabel}
        </span>
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
          {(['edit', 'split', 'preview'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => changeMode(m)}
              className={`rounded px-2 py-1 text-xs ${
                mode === m ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'
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

      <div className="flex flex-wrap items-center gap-1.5">
        {(activeDoc.tags ?? []).map((tag) => {
          const meta = allTags.find(t => t.name === tag)
          const color = meta?.color
          return (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ring-1 ring-inset ring-border"
              style={color ? { backgroundColor: `${color}33`, color, borderColor: color } : undefined}
            >
              {tag}
              <button
                type="button"
                onClick={() => void onRemoveTag(tag)}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="size-3" />
              </button>
            </span>
          )
        })}
        <div className="flex items-center gap-1">
          <input
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void onAddTag()
              }
            }}
            placeholder="加标签"
            className="w-24 rounded-md border border-border bg-transparent px-2 py-0.5 text-xs text-foreground outline-none focus:border-border"
          />
          <button
            type="button"
            onClick={() => void onAddTag()}
            disabled={!tagInput.trim()}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
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
          <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-background">
            <KbMarkdownPreview content={activeDoc.content} className="h-full" />
          </div>
        )}
      </div>
    </div>
  )
}
