import { Button } from '@components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover'
import { useKbEditorController } from '@hooks/useKbEditorController'
import { FilePlus, Loader2 } from 'lucide-react'
import { KbDocTagsBar } from './KbDocTagsBar'
import { KbMarkdownEditor } from './KbMarkdownEditor'
import { KbMarkdownPreview } from './KbMarkdownPreview'
import { KbRichEditor } from './KbRichEditor'
import { KbSourceEditor } from './KbSourceEditor'
import { KB_VIEW_MODE_LABEL } from './kbViewMode'

export type { KbViewMode } from './kbViewMode'

interface KbEditorProps {
  /** 源码模式时通知父级打开右侧 AI 轨 */
  onSourceModeChange?: (active: boolean) => void
}

export function KbEditor({ onSourceModeChange }: KbEditorProps) {
  const editor = useKbEditorController({ onSourceModeChange })
  const {
    activeDoc,
    tags: allTags,
    saving,
    committing,
    mutating,
    mutation,
    error,
    createBlank,
    updateLocalContent,
    mode,
    changeMode,
    deleteOpen,
    setDeleteOpen,
    nameEditingId,
    nameDraft,
    setNameDraft,
    nameError,
    setNameError,
    beginNameEdit,
    cancelNameEdit,
    applyNameDraft,
    dirty,
    statusLabel,
    save,
    submit,
    deleteActive,
    changeTagIds,
  } = editor

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

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        {nameEditingId === activeDoc.id
          ? (
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => {
                  setNameDraft(e.target.value)
                  if (nameError)
                    setNameError(null)
                }}
                onBlur={() => {
                  applyNameDraft()
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    applyNameDraft()
                  }
                  else if (e.key === 'Escape') {
                    e.preventDefault()
                    cancelNameEdit()
                  }
                }}
                aria-invalid={nameError != null}
                className={`min-w-32 flex-1 rounded-md border bg-background px-2 py-1.5 text-base font-medium text-foreground outline-none ${
                  nameError ? 'border-destructive focus:border-destructive' : 'border-border focus:border-border'
                }`}
              />
            )
          : (
              <button
                type="button"
                title="双击编辑标题"
                onDoubleClick={beginNameEdit}
                className="min-w-32 flex-1 truncate rounded-md px-2 py-1.5 text-left text-base font-medium text-foreground hover:bg-accent/40"
              >
                {activeDoc.name || '未命名'}
              </button>
            )}
        {activeDoc.vdir && (
          <span className="max-w-[40%] truncate text-xs text-muted-foreground" title={activeDoc.vdir}>
            {activeDoc.vdir}
          </span>
        )}
        <span className={`text-xs ${dirty ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>
          {statusLabel}
        </span>
        <Popover open={deleteOpen} onOpenChange={setDeleteOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={mutating}
              className="text-xs text-destructive hover:text-destructive/80 disabled:opacity-40"
            >
              删除
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-3">
            <p className="text-xs text-foreground">确定删除当前文档？不可恢复。</p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                disabled={mutating}
                onClick={() => setDeleteOpen(false)}
                className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
              >
                取消
              </button>
              <button
                type="button"
                disabled={mutating}
                onClick={() => void deleteActive()}
                className="rounded-md bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-600/90 disabled:opacity-40"
              >
                {mutation === 'delete' ? <Loader2 className="size-3 animate-spin" /> : '确认删除'}
              </button>
            </div>
          </PopoverContent>
        </Popover>
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
          {(['rich', 'source', 'split', 'read'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => changeMode(m)}
              className={`rounded px-2 py-1 text-xs ${
                mode === m ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {KB_VIEW_MODE_LABEL[m]}
            </button>
          ))}
        </div>
        <div className="inline-flex h-8 w-36 shrink-0 overflow-hidden rounded-md border border-border">
          <button
            type="button"
            disabled={mutating}
            onClick={() => void save()}
            className="inline-flex flex-1 items-center justify-center gap-1 border-r border-border bg-background text-xs text-foreground hover:bg-accent disabled:opacity-40"
          >
            {saving ? <Loader2 className="size-3 animate-spin" /> : null}
            保存
          </button>
          <button
            type="button"
            disabled={mutating}
            onClick={() => void submit()}
            className="inline-flex flex-1 items-center justify-center gap-1 bg-primary text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            {committing ? <Loader2 className="size-3 animate-spin" /> : null}
            提交
          </button>
        </div>
      </div>

      {nameError && (
        <p className="text-xs text-destructive">{nameError}</p>
      )}

      <KbDocTagsBar
        key={activeDoc.id}
        tagIds={activeDoc.tagIds ?? []}
        allTags={allTags}
        onChangeTagIds={changeTagIds}
      />

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <div className={`min-h-0 flex-1 ${mode === 'split' ? 'grid grid-cols-2 gap-3' : 'flex flex-col'}`}>
        {mode === 'rich' && (
          <KbRichEditor
            key={activeDoc.id}
            docId={activeDoc.id}
            value={activeDoc.content}
            onChange={updateLocalContent}
          />
        )}
        {mode === 'source' && (
          <KbSourceEditor
            key={activeDoc.id}
            docId={activeDoc.id}
            value={activeDoc.content}
            onChange={updateLocalContent}
          />
        )}
        {mode === 'split' && (
          <>
            <KbMarkdownEditor
              key={activeDoc.id}
              docId={activeDoc.id}
              value={activeDoc.content}
              onChange={updateLocalContent}
            />
            <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-background">
              <KbMarkdownPreview content={activeDoc.content} className="h-full" />
            </div>
          </>
        )}
        {mode === 'read' && (
          <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-background">
            <KbMarkdownPreview content={activeDoc.content} className="h-full" />
          </div>
        )}
      </div>
    </div>
  )
}
