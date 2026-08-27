import { ProjectManager } from '@components/project/ProjectManager'
import { TagManager } from '@components/tags/TagManager'
import { useKbDocuments } from '@hooks/useKbDocuments'
import { DirStore } from '@stores/dir-store'
import { SkillStore } from '@stores/skill-store'
import { useAtomValue } from 'jotai'
import { RefreshCw, Search, Settings2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { KbFileTree } from './KbFileTree'
import { KbImportDialog } from './KbImportDialog'
import { buildKbTree } from './kbTree'

const LS_EXPANDED = 'kb.expandedFolders'

function readLsExpanded(): string[] | null {
  try {
    const raw = localStorage.getItem(LS_EXPANDED)
    if (!raw)
      return null
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : null
  }
  catch {
    return null
  }
}

function writeLsExpanded(ids: string[]): void {
  try {
    localStorage.setItem(LS_EXPANDED, JSON.stringify(ids))
  }
  catch {
    // ignore
  }
}

export function KbSidebar({
  recallOpen = false,
  onToggleRecall,
}: {
  recallOpen?: boolean
  onToggleRecall?: () => void
}) {
  const {
    dirTree,
    filteredDocs,
    tags,
    selectedTagIds,
    activeId,
    isLoading,
    error,
    refresh,
    select,
    toggleTag,
    createFolder,
    renameFolder,
    moveFolder,
    removeFolder,
    moveDoc,
  } = useKbDocuments()

  const skillsByDirId = useAtomValue(SkillStore.skillsByDirIdAtom)
  const dirsById = useAtomValue(DirStore.dirsByIdAtom)
  const skillError = useAtomValue(SkillStore.errorAtom)
  const tree = buildKbTree(dirTree, filteredDocs, skillsByDirId)

  useEffect(() => {
    void SkillStore.refresh()
  }, [])
  const rootFolderIds = new Set(dirTree.roots.map(n => n.dir.id))
  /** 展开/折叠持久化：localStorage 记用户展开的文件夹 id；首次（无记录）默认根展开 */
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const raw = readLsExpanded()
    return raw ? new Set(raw) : new Set(rootFolderIds)
  })
  const [importTarget, setImportTarget] = useState<{ mountDirId: string, mountPath: string } | null>(null)
  const [tagManagerOpen, setTagManagerOpen] = useState(false)
  const [projectManagerOpen, setProjectManagerOpen] = useState(false)

  function toggleFolder(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id))
        next.delete(id)
      else
        next.add(id)
      writeLsExpanded([...next])
      return next
    })
  }

  function ensureExpanded(id: string) {
    setExpanded((prev) => {
      if (prev.has(id))
        return prev
      const next = new Set(prev)
      next.add(id)
      writeLsExpanded([...next])
      return next
    })
  }

  async function onCreateFolder(parentId: string | null, name: string) {
    const node = await createFolder(name, parentId)
    if (parentId)
      ensureExpanded(parentId)
    ensureExpanded(node.id)
  }

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex items-center gap-1 border-b border-border p-2 pr-8">
        <span className="flex-1 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          知识库
        </span>
        {onToggleRecall && (
          <button
            type="button"
            title="召回测试"
            onClick={onToggleRecall}
            className={`rounded-md p-1.5 hover:bg-accent ${
              recallOpen ? 'bg-accent text-sky-700 dark:text-sky-300' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Search className="size-3.5" />
          </button>
        )}
        <button
          type="button"
          title="项目管理"
          onClick={() => setProjectManagerOpen(true)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Settings2 className="size-3.5" />
        </button>
        <button
          type="button"
          title="刷新"
          onClick={() => void refresh()}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <RefreshCw className="size-3.5" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b border-border p-2">
        {tags.map((tag) => {
          const on = selectedTagIds.includes(tag.id)
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggleTag(tag.id)}
              className={`rounded-full px-2 py-0.5 text-xs ring-1 ring-inset ${
                on ? 'ring-2 ring-sky-400' : 'ring-border'
              }`}
              style={tag.color
                ? { backgroundColor: `${tag.color}33`, color: tag.color, borderColor: tag.color }
                : undefined}
            >
              {tag.name}
            </button>
          )
        })}
        {tags.length === 0 && (
          <span className="px-1 text-xs text-muted-foreground">暂无标签</span>
        )}
        <button
          type="button"
          title="管理标签"
          onClick={() => setTagManagerOpen(true)}
          className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Settings2 className="size-3.5" />
        </button>
      </div>

      {isLoading && (
        <p className="px-2 py-2 text-sm text-muted-foreground">加载中…</p>
      )}
      {error != null && (
        <p className="px-2 py-2 text-sm text-destructive">{error}</p>
      )}
      {skillError != null && (
        <p className="px-2 py-2 text-sm text-destructive">{skillError}</p>
      )}
      {!isLoading && tree.length === 0 && (
        <p className="px-2 py-2 text-sm text-muted-foreground">
          暂无内容。先用下方「新建项目」创建根级项目，再在项目/文件夹行上点「引入文档」。
        </p>
      )}
      <KbFileTree
        dirTree={dirTree}
        tree={tree}
        expanded={expanded}
        activeId={activeId}
        onToggle={toggleFolder}
        onSelect={select}
        onCreateFolder={onCreateFolder}
        onRenameFolder={renameFolder}
        onDeleteFolder={removeFolder}
        onMoveFolder={moveFolder}
        onMoveDoc={moveDoc}
        onImportInto={(mountDirId, mountPath) => setImportTarget({ mountDirId, mountPath })}
        onMarkSkill={async (dirId) => {
          const dir = dirsById.get(dirId)
          if (!dir)
            return
          await SkillStore.markDir(dirId, dir).catch(() => {})
        }}
        onUnmarkSkill={id => SkillStore.unmark(id)}
      />
      {importTarget && (
        <KbImportDialog
          open
          mountDirId={importTarget.mountDirId}
          mountPath={importTarget.mountPath}
          onClose={() => setImportTarget(null)}
        />
      )}
      <TagManager open={tagManagerOpen} onClose={() => setTagManagerOpen(false)} />
      <ProjectManager open={projectManagerOpen} onClose={() => setProjectManagerOpen(false)} />
    </aside>
  )
}
