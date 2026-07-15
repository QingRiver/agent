import type { KbTagRow } from '@apis/kb-api'
import { KB_DEFAULT_ID, KbApi } from '@apis/kb-api'
import { KbStore } from '@stores/kb-store'
import { useAtomValue } from 'jotai'
import { Check, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'

const PRESET_COLORS = ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#f472b6', '#fb923c', '#94a3b8']

interface KbTagManagerProps {
  open: boolean
  onClose: () => void
}

export function KbTagManager({ open, onClose }: KbTagManagerProps) {
  const tags = useAtomValue(KbStore.tagsAtom)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 新建
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState<string | undefined>(undefined)
  // 编辑态：tagId → 正在改名/改色
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState<string | undefined>(undefined)
  // 删除二次确认：tagId → affectedDocs
  const [pendingDelete, setPendingDelete] = useState<{
    id: string
    name: string
    affectedDocs: number
  } | null>(null)

  if (!open)
    return null

  async function refresh() {
    await KbStore.refreshTags()
  }

  async function onCreate() {
    const name = newName.trim()
    if (!name)
      return
    setBusy(true)
    setError(null)
    try {
      await KbApi.createTag(KB_DEFAULT_ID, { name, ...(newColor ? { color: newColor } : {}) })
      setNewName('')
      setNewColor(undefined)
      await refresh()
    }
    catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    finally {
      setBusy(false)
    }
  }

  async function onSaveEdit(tag: KbTagRow) {
    setBusy(true)
    setError(null)
    try {
      if (editName.trim() && editName.trim() !== tag.name)
        await KbApi.renameTag(tag.id, editName.trim())
      if (editColor !== undefined)
        await KbApi.updateTagColor(tag.id, editColor ?? null)
      setEditingId(null)
      await refresh()
    }
    catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    finally {
      setBusy(false)
    }
  }

  async function onAskDelete(tag: KbTagRow) {
    setBusy(true)
    setError(null)
    try {
      const affectedDocs = await KbApi.deleteTag(tag.id, true) // dryRun：只查影响数，不删
      setPendingDelete({ id: tag.id, name: tag.name, affectedDocs })
    }
    catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    finally {
      setBusy(false)
    }
  }

  async function onConfirmDelete() {
    if (!pendingDelete)
      return
    setBusy(true)
    setError(null)
    try {
      await KbApi.deleteTag(pendingDelete.id, false) // 真删
      setPendingDelete(null)
      await refresh()
    }
    catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    finally {
      setBusy(false)
    }
  }

  function startEdit(tag: KbTagRow) {
    setEditingId(tag.id)
    setEditName(tag.name)
    setEditColor(tag.color ?? undefined)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-slate-800 bg-slate-950 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800 p-3">
          <span className="text-sm font-medium text-slate-200">标签管理</span>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {/* 新建 */}
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter')
                  void onCreate()
              }}
              placeholder="新标签名"
              className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-slate-500"
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

          {/* 列表 */}
          {tags.map(tag => (
            <div key={tag.id} className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900/50 px-2 py-1.5">
              {editingId === tag.id
                ? (
                    <>
                      <input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus:border-slate-500"
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
                      <button type="button" onClick={() => void onSaveEdit(tag)} disabled={busy} className="rounded p-1 text-emerald-400 hover:bg-slate-800">
                        <Check className="size-3.5" />
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} className="rounded p-1 text-slate-400 hover:bg-slate-800">
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
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{tag.name}</span>
                      <button type="button" onClick={() => startEdit(tag)} disabled={busy} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
                        <Pencil className="size-3.5" />
                      </button>
                      <button type="button" onClick={() => void onAskDelete(tag)} disabled={busy} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-red-400">
                        <Trash2 className="size-3.5" />
                      </button>
                    </>
                  )}
            </div>
          ))}
          {tags.length === 0 && <p className="py-4 text-center text-sm text-slate-500">暂无标签</p>}
        </div>

        {error && <p className="border-t border-slate-800 p-2 text-sm text-red-400">{error}</p>}

        {pendingDelete && (
          <div className="space-y-2 border-t border-slate-800 bg-slate-900/80 p-3 text-xs text-slate-300">
            <p>
              确定删除标签「
              {pendingDelete.name}
              」？
              {pendingDelete.affectedDocs > 0 && (
                <span className="text-amber-400">
                  将影响
                  {pendingDelete.affectedDocs}
                  {' '}
                  篇文档（从其标签中移除，文档保留）
                </span>
              )}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => void onConfirmDelete()} className="rounded bg-red-600/80 px-2 py-1 text-white hover:bg-red-600">
                删除
              </button>
              <button type="button" onClick={() => setPendingDelete(null)} className="rounded bg-slate-700 px-2 py-1 hover:bg-slate-600">
                取消
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
