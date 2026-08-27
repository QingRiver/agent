import type { ProjectSelection } from './ProjectFileTree'
import { ProjectFileTree } from '@components/project/ProjectFileTree'
import { ProjectPane } from '@components/project/ProjectPane'
import { useAuth } from '@hooks/useAuth'
import { DirStore } from '@stores/dir-store'
import { GtdStore } from '@stores/gtd-store'
import { KbStore } from '@stores/kb-store'
import { SkillStore } from '@stores/skill-store'
import { TagsStore } from '@stores/tags-store'
import { useAtomValue } from 'jotai'
import { Plus, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { buildProjectTree, projectRoots } from './projectTree'

interface ProjectManagerProps {
  open: boolean
  onClose: () => void
}

export function ProjectManager({ open, onClose }: ProjectManagerProps) {
  const { user } = useAuth()
  const userId = user?.id
  const dirs = useAtomValue(DirStore.dirsAtom)
  const dirTree = useAtomValue(DirStore.dirTreeAtom)
  const skills = useAtomValue(SkillStore.skillsAtom)
  const texts = useAtomValue(SkillStore.textsAtom)
  const docs = useAtomValue(KbStore.docsAtom)
  const allTags = useAtomValue(TagsStore.tagsAtom)
  const rowStore = useAtomValue(GtdStore.rowStoreAtom)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [selected, setSelected] = useState<ProjectSelection | null>(null)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const projects = useMemo(() => projectRoots(dirs), [dirs])

  useEffect(() => {
    if (!open)
      return
    void DirStore.refresh()
    void SkillStore.refresh()
    void TagsStore.refreshTags()
    if (userId) {
      KbStore.onUserIdChange(userId)
      void KbStore.refresh()
      void GtdStore.onUserIdChange(userId)
    }
  }, [open, userId])

  const resolvedProjectId = projectId && projects.some(p => p.id === projectId)
    ? projectId
    : (projects[0]?.id ?? null)

  const skillsByDirId = useMemo(() => new Map(skills.map(s => [s.dirId, s])), [skills])

  const tree = useMemo(() => {
    if (!resolvedProjectId)
      return null
    return buildProjectTree(
      dirTree,
      resolvedProjectId,
      skillsByDirId,
      texts,
      docs.map(d => ({ id: d.id, name: d.name, mountDirId: d.mountDirId ?? null })),
      rowStore.liveTasks().map(t => ({
        id: t.id,
        name: t.data.name,
        mountDirId: t.data.mountDirId ?? null,
      })),
    )
  }, [dirTree, docs, resolvedProjectId, rowStore, skillsByDirId, texts])

  const enclosingSkill = useMemo(() => {
    if (!selected)
      return null
    const dirId = selected.kind === 'folder'
      ? selected.id
      : selected.kind === 'text'
        ? texts.find(t => t.id === selected.id)?.mountDirId
        : null
    if (!dirId)
      return null
    let cur: string | null = dirId
    const guard = new Set<string>()
    while (cur && !guard.has(cur)) {
      guard.add(cur)
      const skill = skillsByDirId.get(cur)
      if (skill)
        return skill
      cur = dirs.find(d => d.id === cur)?.parentId ?? null
    }
    return null
  }, [dirs, selected, skillsByDirId, texts])

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

  async function markSkill(dirId: string) {
    const dir = dirs.find(d => d.id === dirId)
    if (!dir)
      throw new Error('目录不存在')
    await SkillStore.markDir(dirId, dir)
  }

  const selectedText = selected?.kind === 'text' ? texts.find(t => t.id === selected.id) : null
  const selectedDoc = selected?.kind === 'doc' ? docs.find(d => d.id === selected.id) : null
  const selectedFolder = selected?.kind === 'folder' ? dirs.find(d => d.id === selected.id) : null

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
                  onClick={() => {
                    setProjectId(p.id)
                    setSelected({ kind: 'folder', id: p.id })
                  }}
                >
                  {p.name}
                </button>
              ))}
              {projects.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">暂无项目</p>}
            </div>
          </aside>
          <div className="flex w-64 min-w-0 shrink-0 flex-col border-r border-border">
            {tree && tree.kind === 'folder'
              ? (
                  <ProjectFileTree
                    root={tree}
                    selected={selected}
                    onSelect={setSelected}
                    onCreateFolder={(parentId, name) => run(async () => { await DirStore.createDir(parentId, name) })}
                    onRenameFolder={(id, name) => run(() => DirStore.rename(id, name))}
                    onDeleteFolder={id => run(() => DirStore.delete(id))}
                    onMoveFolder={(id, parentId) => run(() => DirStore.move(id, parentId))}
                    onCreateText={(dirId, filename) => run(async () => { await SkillStore.upsertText({ dirId, filename, content: '' }) })}
                    onDeleteText={id => run(() => SkillStore.deleteText(id))}
                    onMoveText={(id, dirId, filename) => run(async () => {
                      const row = texts.find(t => t.id === id)
                      if (!row)
                        return
                      const clash = texts.find(t => t.id !== id && t.mountDirId === dirId && t.filename === filename)
                      if (clash)
                        throw new Error(`目标位置已存在同名文件: ${filename}`)
                      await SkillStore.upsertText({ dirId, filename, content: row.content })
                      if (row.mountDirId !== dirId || row.filename !== filename)
                        await SkillStore.deleteText(id)
                    })}
                    onMarkSkill={dirId => run(() => markSkill(dirId))}
                    onUnmarkSkill={id => run(() => SkillStore.unmark(id))}
                  />
                )
              : <p className="p-3 text-xs text-muted-foreground">选择项目</p>}
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <ProjectPane
              selection={selected}
              folderName={selectedFolder?.name}
              folderKind={selectedFolder?.kind}
              skill={enclosingSkill}
              text={selectedText ?? null}
              docTagIds={selectedDoc?.tagIds}
              taskTagIds={selected?.kind === 'task' ? rowStore.tagIdsOf(selected.id) : undefined}
              allTags={allTags}
              onChangeSkillTags={(id, tagIds) => run(() => SkillStore.setTagIds(id, tagIds))}
              onChangeDocTags={(id, tagIds) => run(async () => { await KbStore.updateMeta(id, { tagIds }) })}
              onChangeTaskTags={(id, tagIds) => GtdStore.setTaskTags(id, tagIds)}
              onMarkSkill={dirId => run(() => markSkill(dirId))}
              onUnmarkSkill={id => run(() => SkillStore.unmark(id))}
            />
          </div>
        </div>
        {error && <p className="border-t border-border px-3 py-2 text-xs text-destructive">{error}</p>}
      </div>
    </div>
  )
}
