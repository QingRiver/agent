import type { ProjectSelection } from './ProjectFileTree'
import { KbApi } from '@apis/kb-api'
import { ProjectFileTree } from '@components/project/ProjectFileTree'
import { ProjectPane } from '@components/project/ProjectPane'
import { useAuth } from '@hooks/useAuth'
import { DirStore } from '@stores/dir-store'
import { GtdStore } from '@stores/gtd-store'
import { KbStore } from '@stores/kb-store'
import { SkillStore } from '@stores/skill-store'
import { TagsStore } from '@stores/tags-store'
import { useNavigate } from '@tanstack/react-router'
import { useAtomValue } from 'jotai'
import { useEffect, useMemo, useState } from 'react'
import { findEnclosingKbDirId, normalizeKbDocName } from './projectKb'
import { buildProjectTree } from './projectTree'

interface ProjectWorkspaceProps {
  projectId: string
}

/**
 * 项目详情工作区：左文件树 + 右展示（原 ProjectManager 中/右栏）。
 */
export function ProjectWorkspace({ projectId }: ProjectWorkspaceProps) {
  const { user } = useAuth()
  const userId = user?.id
  const navigate = useNavigate()
  const dirs = useAtomValue(DirStore.dirsAtom)
  const dirsById = useAtomValue(DirStore.dirsByIdAtom)
  const dirTree = useAtomValue(DirStore.dirTreeAtom)
  const skills = useAtomValue(SkillStore.skillsAtom)
  const texts = useAtomValue(SkillStore.textsAtom)
  const docs = useAtomValue(KbStore.docsAtom)
  const kbsByDirId = useAtomValue(KbStore.kbsByDirIdAtom)
  const allTags = useAtomValue(TagsStore.tagsAtom)
  const rowStore = useAtomValue(GtdStore.rowStoreAtom)
  const [selected, setSelected] = useState<ProjectSelection | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void DirStore.refresh()
    void SkillStore.refresh()
    void TagsStore.refreshTags()
    if (userId) {
      KbStore.onUserIdChange(userId)
      void KbStore.refresh()
      void GtdStore.onUserIdChange(userId)
    }
  }, [userId])

  const skillsByDirId = useMemo(() => new Map(skills.map(s => [s.dirId, s])), [skills])

  const tree = useMemo(() => {
    return buildProjectTree(
      dirTree,
      projectId,
      skillsByDirId,
      texts,
      docs.map(d => ({ id: d.id, name: d.name, mountDirId: d.mountDirId ?? null })),
      rowStore.liveTasks().map(t => ({
        id: t.id,
        name: t.data.name,
        mountDirId: t.data.mountDirId ?? null,
      })),
    )
  }, [dirTree, docs, projectId, rowStore, skillsByDirId, texts])

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

  function enclosingKb(dirId: string): string | null {
    return findEnclosingKbDirId(dirsById, kbsByDirId, dirId)
  }

  function openKb(dirId: string) {
    void navigate({ to: '/kb', search: { kb: dirId } })
  }

  function openDoc(docId: string) {
    const doc = docs.find(d => d.id === docId)
    const kbId = doc?.mountDirId ? enclosingKb(doc.mountDirId) : null
    void navigate({
      to: '/kb',
      search: kbId ? { kb: kbId, doc: docId } : { doc: docId },
    })
  }

  async function run(fn: () => Promise<void>) {
    setError(null)
    try {
      await fn()
    }
    catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
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
  const selectedFolderKb = selected?.kind === 'folder' ? enclosingKb(selected.id) : null
  const selectedIsKbRoot = selected?.kind === 'folder' && kbsByDirId.has(selected.id)

  if (!tree || tree.kind !== 'folder') {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        项目不存在或已删除
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        <div className="flex w-64 min-w-0 shrink-0 flex-col border-r border-border">
          <ProjectFileTree
            root={tree}
            selected={selected}
            onSelect={setSelected}
            kbDirIds={kbsByDirId}
            enclosingKbOf={enclosingKb}
            onOpenKb={openKb}
            onOpenDoc={openDoc}
            onCreateFolder={(parentId, name) => run(async () => { await DirStore.createDir(parentId, name) })}
            onRenameFolder={(id, name) => run(() => DirStore.rename(id, name))}
            onDeleteFolder={id => run(() => DirStore.delete(id))}
            onMoveFolder={(id, parentId) => run(() => DirStore.move(id, parentId))}
            onCreateText={(dirId, filename) => run(async () => { await SkillStore.upsertText({ dirId, filename, content: '' }) })}
            onCreateDoc={(dirId, name) => run(async () => {
              const doc = await KbApi.createDoc({
                name: normalizeKbDocName(name),
                content: '',
                mountDirId: dirId,
              })
              await KbStore.refresh()
              openDoc(doc.id)
            })}
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
            onMarkKb={dirId => run(() => KbStore.markKb(dirId))}
            onUnmarkKb={dirId => run(() => KbStore.unmarkKb(dirId))}
          />
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
            isKbRoot={selectedIsKbRoot}
            enclosingKbDirId={selectedFolderKb}
            onOpenKb={openKb}
            onOpenDoc={openDoc}
            onChangeSkillTags={(id, tagIds) => run(() => SkillStore.setTagIds(id, tagIds))}
            onChangeDocTags={(id, tagIds) => run(async () => { await KbStore.updateMeta(id, { tagIds }) })}
            onChangeTaskTags={(id, tagIds) => GtdStore.setTaskTags(id, tagIds)}
            onMarkSkill={dirId => run(() => markSkill(dirId))}
            onUnmarkSkill={id => run(() => SkillStore.unmark(id))}
            onMarkKb={dirId => run(() => KbStore.markKb(dirId))}
            onUnmarkKb={dirId => run(() => KbStore.unmarkKb(dirId))}
          />
        </div>
      </div>
      {error && <p className="border-t border-border px-3 py-2 text-xs text-destructive">{error}</p>}
    </div>
  )
}
