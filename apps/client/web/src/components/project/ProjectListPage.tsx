import type { DirDto } from '@apis/dir-api'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { DirStore } from '@stores/dir-store'
import { Link } from '@tanstack/react-router'
import { useAtomValue } from 'jotai'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { NewProjectDialog } from './NewProjectDialog'
import { projectRoots } from './projectTree'

/**
 * 项目列表：新建 / 重命名 / 删除；点击进入详情。
 */
export function ProjectListPage() {
  const dirs = useAtomValue(DirStore.dirsAtom)
  const projects = useMemo(() => projectRoots(dirs), [dirs])
  const [createOpen, setCreateOpen] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [pendingDelete, setPendingDelete] = useState<DirDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(fn: () => Promise<void>) {
    setError(null)
    setBusy(true)
    try {
      await fn()
    }
    catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  function startRename(p: DirDto) {
    setPendingDelete(null)
    setRenamingId(p.id)
    setRenameValue(p.name)
  }

  async function commitRename() {
    if (renamingId == null)
      return
    const name = renameValue.trim()
    if (!name) {
      setRenamingId(null)
      return
    }
    await DirStore.rename(renamingId, name)
    setRenamingId(null)
  }

  async function confirmDelete() {
    if (pendingDelete == null)
      return
    const id = pendingDelete.id
    await DirStore.delete(id)
    setPendingDelete(null)
    if (renamingId === id)
      setRenamingId(null)
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-65px)] w-full max-w-3xl flex-col px-6 py-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">项目</h1>
          <p className="mt-1 text-sm text-muted-foreground">管理项目根目录，进入后编辑文件树与内容</p>
        </div>
        <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          新建项目
        </Button>
      </div>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      {pendingDelete && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
          <span className="text-destructive">
            确定删除项目「
            {pendingDelete.name}
            」？其下目录与挂载会一并处理。
          </span>
          <Button
            type="button"
            size="sm"
            disabled={busy}
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={() => void run(confirmDelete)}
          >
            确定删除
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => setPendingDelete(null)}
          >
            取消
          </Button>
        </div>
      )}

      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto rounded-lg border border-border bg-card p-2">
        {projects.map((p) => {
          const renaming = renamingId === p.id
          return (
            <li
              key={p.id}
              className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-accent/60"
            >
              {renaming
                ? (
                    <Input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter')
                          void run(commitRename)
                        if (e.key === 'Escape')
                          setRenamingId(null)
                      }}
                      onBlur={() => void run(commitRename)}
                      className="h-8 flex-1"
                      disabled={busy}
                    />
                  )
                : (
                    <Link
                      to="/projects/$id"
                      params={{ id: p.id }}
                      className="min-w-0 flex-1 truncate text-sm font-medium text-foreground hover:underline"
                    >
                      {p.name}
                    </Link>
                  )}
              <button
                type="button"
                title="重命名"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                disabled={busy}
                onClick={() => {
                  if (renaming)
                    void run(commitRename)
                  else
                    startRename(p)
                }}
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                type="button"
                title="删除"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                disabled={busy}
                onClick={() => {
                  setRenamingId(null)
                  setPendingDelete(p)
                }}
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          )
        })}
        {projects.length === 0 && (
          <li className="px-3 py-8 text-center text-sm text-muted-foreground">
            暂无项目，点击右上角新建
          </li>
        )}
      </ul>

      <NewProjectDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}
