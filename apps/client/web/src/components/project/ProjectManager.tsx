import { ProjectWorkspace } from '@components/project/ProjectWorkspace'
import { DirStore } from '@stores/dir-store'
import { useAtomValue } from 'jotai'
import { Plus, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { projectRoots } from './projectTree'

interface ProjectManagerProps {
  open: boolean
  onClose: () => void
}

/**
 * 项目管理弹窗（KB / GTD 侧栏入口）。
 * 左：项目列表；中+右：复用 ProjectWorkspace。
 */
export function ProjectManager({ open, onClose }: ProjectManagerProps) {
  const dirs = useAtomValue(DirStore.dirsAtom)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const projects = useMemo(() => projectRoots(dirs), [dirs])

  useEffect(() => {
    if (!open)
      return
    void DirStore.refresh()
  }, [open])

  const resolvedProjectId = projectId && projects.some(p => p.id === projectId)
    ? projectId
    : (projects[0]?.id ?? null)

  if (!open)
    return null

  async function run(fn: () => Promise<void>) {
    setError(null)
    try {
      await fn()
    }
    catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function createProject() {
    const name = newName.trim()
    if (!name)
      return
    const dir = await DirStore.createProject(name)
    setNewName('')
    setProjectId(dir.id)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-medium">项目管理</span>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-accent">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1">
          <aside className="flex w-56 shrink-0 flex-col border-r border-border">
            <div className="flex gap-1 border-b border-border p-2">
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter')
                    void run(createProject)
                }}
                placeholder="新项目"
                className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs"
              />
              <button type="button" className="rounded-md p-1 hover:bg-accent" onClick={() => void run(createProject)}>
                <Plus className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1">
              {projects.map(p => (
                <button
                  key={p.id}
                  type="button"
                  className={`flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent ${resolvedProjectId === p.id ? 'bg-accent' : ''}`}
                  onClick={() => setProjectId(p.id)}
                >
                  {p.name}
                </button>
              ))}
              {projects.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">暂无项目</p>}
            </div>
          </aside>
          {resolvedProjectId
            ? <ProjectWorkspace key={resolvedProjectId} projectId={resolvedProjectId} />
            : <p className="flex flex-1 items-center justify-center p-3 text-xs text-muted-foreground">选择或新建项目</p>}
        </div>
        {error && <p className="border-t border-border px-3 py-2 text-xs text-destructive">{error}</p>}
      </div>
    </div>
  )
}
