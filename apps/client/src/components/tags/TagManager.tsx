import type { TagDeleteDryRunResult, TagRow } from '@apis/tags-api'
import { Checkbox } from '@components/ui/checkbox'
import { GtdStore } from '@stores/gtd-store'
import { KbStore } from '@stores/kb-store'
import { TagsStore } from '@stores/tags-store'
import { useAtomValue } from 'jotai'
import { Check, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'

const PRESET_COLORS = ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#f472b6', '#fb923c', '#94a3b8']

interface TagManagerProps {
  open: boolean
  onClose: () => void
}

type DeleteMode = 'untag' | 'delete_entities'

function isDryRunResult(r: unknown): r is TagDeleteDryRunResult {
  return r != null && typeof r === 'object' && 'docs' in r && 'tasks' in r
}

export function TagManager({ open, onClose }: TagManagerProps) {
  const tags = useAtomValue(TagsStore.tagsAtom)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState<string | undefined>(undefined)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState<string | undefined>(undefined)

  const [pendingDelete, setPendingDelete] = useState<TagRow | null>(null)
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1)
  const [deleteMode, setDeleteMode] = useState<DeleteMode>('untag')
  const [dryRunResult, setDryRunResult] = useState<TagDeleteDryRunResult | null>(null)
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(() => new Set())
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(() => new Set())
  const [confirmDestructive, setConfirmDestructive] = useState(false)

  if (!open)
    return null

  function resetDeleteFlow() {
    setPendingDelete(null)
    setDeleteStep(1)
    setDeleteMode('untag')
    setDryRunResult(null)
    setSelectedDocIds(new Set())
    setSelectedTaskIds(new Set())
    setConfirmDestructive(false)
  }

  function handleClose() {
    resetDeleteFlow()
    setEditingId(null)
    setError(null)
    onClose()
  }

  function goBackToStep1() {
    setDeleteStep(1)
    setConfirmDestructive(false)
  }

  async function afterDeleteRefresh(hadTasks: boolean) {
    void KbStore.refresh()
    if (hadTasks)
      void GtdStore.load().catch(() => {})
  }

  async function onCreate() {
    const name = newName.trim()
    if (!name)
      return
    setBusy(true)
    setError(null)
    try {
      await TagsStore.create(name, newColor)
      setNewName('')
      setNewColor(undefined)
      // REST 建标会推进 gtd sync clock；拉一把让侧栏 rowStore.liveTags 跟上
      void GtdStore.flushSave().catch(() => {})
    }
    catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  async function onSaveEdit(tag: TagRow) {
    setBusy(true)
    setError(null)
    const trimmedName = editName.trim()
    const shouldRename = trimmedName !== '' && trimmedName !== tag.name
    const shouldUpdateColor = editColor !== undefined
    const nextColor = editColor ?? null
    try {
      if (shouldRename)
        await TagsStore.rename(tag.id, trimmedName)
      if (shouldUpdateColor)
        await TagsStore.updateColor(tag.id, nextColor)
      setEditingId(null)
    }
    catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  async function fetchDryRun(tagId: string, mode: DeleteMode): Promise<TagDeleteDryRunResult> {
    const result = await TagsStore.deleteTag(tagId, { mode, dryRun: true })
    if (!isDryRunResult(result))
      return { docs: [], tasks: [] }
    return result
  }

  async function onAskDelete(tag: TagRow) {
    setBusy(true)
    setError(null)
    setDeleteMode('untag')
    setDeleteStep(1)
    setConfirmDestructive(false)
    try {
      const result = await fetchDryRun(tag.id, 'untag')
      setDryRunResult(result)
      setPendingDelete(tag)
    }
    catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  async function onDeleteModeChange(mode: DeleteMode) {
    setDeleteMode(mode)
    setConfirmDestructive(false)
    if (!pendingDelete)
      return
    if (mode === 'untag') {
      setDeleteStep(1)
      setBusy(true)
      setError(null)
      try {
        const result = await fetchDryRun(pendingDelete.id, 'untag')
        setDryRunResult(result)
      }
      catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
      setBusy(false)
    }
  }

  async function onGoToEntityStep() {
    if (!pendingDelete)
      return
    setBusy(true)
    setError(null)
    try {
      const result = await fetchDryRun(pendingDelete.id, 'delete_entities')
      setDryRunResult(result)
      setSelectedDocIds(new Set(result.docs.map(d => d.id)))
      setSelectedTaskIds(new Set(result.tasks.map(t => t.id)))
      setDeleteStep(2)
      setConfirmDestructive(false)
    }
    catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  async function onConfirmUntagDelete() {
    if (!pendingDelete)
      return
    const hadTasks = (dryRunResult?.tasks.length ?? 0) > 0
    setBusy(true)
    setError(null)
    try {
      await TagsStore.deleteTag(pendingDelete.id, { mode: 'untag' })
      resetDeleteFlow()
      await afterDeleteRefresh(hadTasks)
    }
    catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  async function onConfirmEntityDelete() {
    if (!pendingDelete)
      return
    const hadTasks = selectedTaskIds.size > 0
      || (dryRunResult?.tasks.some(t => !selectedTaskIds.has(t.id)) ?? false)
    setBusy(true)
    setError(null)
    try {
      await TagsStore.deleteTag(pendingDelete.id, {
        mode: 'delete_entities',
        docIds: [...selectedDocIds],
        taskIds: [...selectedTaskIds],
      })
      resetDeleteFlow()
      await afterDeleteRefresh(hadTasks)
    }
    catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  function startEdit(tag: TagRow) {
    setEditingId(tag.id)
    setEditName(tag.name)
    setEditColor(tag.color ?? undefined)
  }

  function toggleDocId(id: string) {
    setSelectedDocIds((prev) => {
      const next = new Set(prev)
      if (next.has(id))
        next.delete(id)
      else
        next.add(id)
      return next
    })
  }

  function toggleTaskId(id: string) {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev)
      if (next.has(id))
        next.delete(id)
      else
        next.add(id)
      return next
    })
  }

  const linkedCount = (dryRunResult?.docs.length ?? 0) + (dryRunResult?.tasks.length ?? 0)
  const entityDeleteCount = selectedDocIds.size + selectedTaskIds.size

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border p-3">
          <span className="text-sm font-medium text-foreground">标签管理</span>
          <button type="button" onClick={handleClose} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter')
                  void onCreate()
              }}
              placeholder="新标签名"
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-border"
            />
            <div className="flex items-center gap-1">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(newColor === c ? undefined : c)}
                  className={`size-4 rounded-full ${newColor === c ? 'ring-2 ring-white' : ''}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => void onCreate()}
              disabled={busy || !newName.trim()}
              className="rounded-md bg-sky-600 p-1.5 text-white disabled:opacity-40 hover:bg-sky-500"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            </button>
          </div>

          {tags.map(tag => (
            <div key={tag.id} className="flex items-center gap-2 rounded-md border border-border bg-muted px-2 py-1.5">
              {editingId === tag.id
                ? (
                    <>
                      <input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-border"
                      />
                      <div className="flex items-center gap-1">
                        {PRESET_COLORS.map(c => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setEditColor(editColor === c ? undefined : c)}
                            className={`size-3.5 rounded-full ${editColor === c ? 'ring-2 ring-white' : ''}`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                      <button type="button" onClick={() => void onSaveEdit(tag)} disabled={busy} className="rounded p-1 text-emerald-700 hover:bg-accent dark:text-emerald-400">
                        <Check className="size-3.5" />
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} className="rounded p-1 text-muted-foreground hover:bg-accent">
                        <X className="size-3.5" />
                      </button>
                    </>
                  )
                : (
                    <>
                      <span
                        className="size-3 shrink-0 rounded-full"
                        style={{ backgroundColor: tag.color ?? undefined, border: tag.color ? 'none' : '1px solid #475569' }}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{tag.name}</span>
                      <button type="button" onClick={() => startEdit(tag)} disabled={busy} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                        <Pencil className="size-3.5" />
                      </button>
                      <button type="button" onClick={() => void onAskDelete(tag)} disabled={busy} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive">
                        <Trash2 className="size-3.5" />
                      </button>
                    </>
                  )}
            </div>
          ))}
          {tags.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">暂无标签</p>}
        </div>

        {error && <p className="border-t border-border p-2 text-sm text-destructive">{error}</p>}

        {pendingDelete && deleteStep === 1 && (
          <div className="space-y-3 border-t border-border bg-muted p-3 text-xs text-foreground">
            <p>
              删除标签「
              {pendingDelete.name}
              」
            </p>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="deleteMode"
                  checked={deleteMode === 'untag'}
                  onChange={() => void onDeleteModeChange('untag')}
                />
                清理标签
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="deleteMode"
                  checked={deleteMode === 'delete_entities'}
                  onChange={() => void onDeleteModeChange('delete_entities')}
                />
                同时删除关联内容
              </label>
            </div>
            {deleteMode === 'untag' && (
              <p className="text-muted-foreground">
                {linkedCount > 0
                  ? `将从 ${dryRunResult?.docs.length ?? 0} 篇文档和 ${dryRunResult?.tasks.length ?? 0} 个 GTD 任务中移除此标签（内容保留）`
                  : '无关联内容，仅删除标签'}
              </p>
            )}
            <div className="flex gap-2">
              {deleteMode === 'untag'
                ? (
                    <button
                      type="button"
                      onClick={() => void onConfirmUntagDelete()}
                      disabled={busy}
                      className="rounded bg-red-600/80 px-2 py-1 text-white hover:bg-red-600 disabled:opacity-40"
                    >
                      删除标签
                    </button>
                  )
                : (
                    <button
                      type="button"
                      onClick={() => void onGoToEntityStep()}
                      disabled={busy}
                      className="rounded bg-red-600/80 px-2 py-1 text-white hover:bg-red-600 disabled:opacity-40"
                    >
                      继续
                    </button>
                  )}
              <button type="button" onClick={resetDeleteFlow} className="rounded bg-muted px-2 py-1 hover:bg-accent">
                取消
              </button>
            </div>
          </div>
        )}

        {pendingDelete && deleteStep === 2 && dryRunResult && (
          <div className="space-y-3 border-t border-border bg-muted p-3 text-xs text-foreground">
            <p>
              选择要随标签「
              {pendingDelete.name}
              」一并删除的内容：
            </p>
            {dryRunResult.docs.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium">知识库文档</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => setSelectedDocIds(new Set(dryRunResult.docs.map(d => d.id)))}
                    >
                      全选
                    </button>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => setSelectedDocIds(new Set())}
                    >
                      全不选
                    </button>
                  </div>
                </div>
                <div className="max-h-32 space-y-1 overflow-y-auto">
                  {dryRunResult.docs.map(doc => (
                    <label key={doc.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-accent/50">
                      <Checkbox
                        checked={selectedDocIds.has(doc.id)}
                        onCheckedChange={() => toggleDocId(doc.id)}
                      />
                      <span className="min-w-0 truncate">{doc.title}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {dryRunResult.tasks.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium">GTD 任务</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => setSelectedTaskIds(new Set(dryRunResult.tasks.map(t => t.id)))}
                    >
                      全选
                    </button>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => setSelectedTaskIds(new Set())}
                    >
                      全不选
                    </button>
                  </div>
                </div>
                <div className="max-h-32 space-y-1 overflow-y-auto">
                  {dryRunResult.tasks.map(task => (
                    <label key={task.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-accent/50">
                      <Checkbox
                        checked={selectedTaskIds.has(task.id)}
                        onCheckedChange={() => toggleTaskId(task.id)}
                      />
                      <span className="min-w-0 truncate">{task.title}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {!confirmDestructive
              ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDestructive(true)}
                    disabled={busy}
                    className="w-full rounded bg-red-600/80 px-2 py-1.5 text-white hover:bg-red-600 disabled:opacity-40"
                  >
                    {`删除标签并删除已选 ${entityDeleteCount} 项`}
                  </button>
                )
              : (
                  <div className="space-y-2">
                    <p className="text-amber-700 dark:text-amber-400">不可恢复，确定继续？</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void onConfirmEntityDelete()}
                        disabled={busy}
                        className="rounded bg-red-600 px-2 py-1 text-white hover:bg-red-700 disabled:opacity-40"
                      >
                        确定删除
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDestructive(false)}
                        className="rounded bg-muted px-2 py-1 hover:bg-accent"
                      >
                        返回
                      </button>
                    </div>
                  </div>
                )}
            <button type="button" onClick={goBackToStep1} className="text-muted-foreground hover:text-foreground">
              返回上一步
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
