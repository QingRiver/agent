import type { KbTreeNode } from './kbTree'
import { useKbDocuments } from '@hooks/useKbDocuments'
import { isDocDirty } from '@stores/kb-store'
import { ChevronDown, ChevronRight, FileText, Folder, Plus, RefreshCw, Search, Settings2, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { KbImportDialog } from './KbImportDialog'
import { KbTagManager } from './KbTagManager'
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

function TreeNodes({
  nodes,
  depth,
  expanded,
  activeId,
  onToggle,
  onSelect,
}: {
  nodes: KbTreeNode[]
  depth: number
  expanded: Set<string>
  activeId: string | null
  onToggle: (id: string) => void
  onSelect: (id: string) => void
}) {
  return (
    <>
      {nodes.map((node) => {
        if (node.kind === 'folder') {
          const open = expanded.has(node.id)
          return (
            <div key={`f-${node.id}`}>
              <button
                type="button"
                onClick={() => onToggle(node.id)}
                className="flex w-full items-center gap-1 rounded-md px-2 py-1 text-left text-sm text-slate-300 hover:bg-slate-800"
                style={{ paddingLeft: 8 + depth * 12 }}
              >
                {open
                  ? <ChevronDown className="size-3.5 shrink-0 text-slate-500" />
                  : <ChevronRight className="size-3.5 shrink-0 text-slate-500" />}
                <Folder className="size-3.5 shrink-0 text-slate-500" />
                <span className="truncate">{node.name}</span>
              </button>
              {open && (
                <TreeNodes
                  nodes={node.children}
                  depth={depth + 1}
                  expanded={expanded}
                  activeId={activeId}
                  onToggle={onToggle}
                  onSelect={onSelect}
                />
              )}
            </div>
          )
        }

        const dirty = isDocDirty(node.doc)
        const selected = node.id === activeId
        return (
          <button
            key={`d-${node.id}`}
            type="button"
            onClick={() => onSelect(node.id)}
            className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-800 ${
              selected ? 'bg-slate-800 text-slate-100' : 'text-slate-300'
            }`}
            style={{ paddingLeft: 8 + depth * 12 }}
          >
            <FileText className="size-3.5 shrink-0 text-slate-500" />
            <span className="min-w-0 flex-1 truncate">{node.name}</span>
            {dirty && (
              <span
                className="size-1.5 shrink-0 rounded-full bg-amber-400"
                title="有未提交改动"
              />
            )}
          </button>
        )
      })}
    </>
  )
}

export function KbSidebar({
  recallOpen = false,
  onToggleRecall,
}: {
  recallOpen?: boolean
  onToggleRecall?: () => void
}) {
  const {
    nodes,
    filteredDocs,
    tags,
    selectedTags,
    activeId,
    isLoading,
    error,
    refresh,
    select,
    toggleTag,
    remove,
  } = useKbDocuments()

  const tree = useMemo(() => buildKbTree(nodes, filteredDocs), [nodes, filteredDocs])
  const rootFolderIds = useMemo(
    () => new Set(nodes.filter(n => n.parentId == null).map(n => n.id)),
    [nodes],
  )
  /** 展开/折叠持久化：localStorage 记用户展开的文件夹 id；首次（无记录）默认根展开 */
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const raw = readLsExpanded()
    return raw ? new Set(raw) : new Set(rootFolderIds)
  })
  const [pendingDelete, setPendingDelete] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [tagManagerOpen, setTagManagerOpen] = useState(false)

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

  async function onDeleteConfirmed() {
    if (!activeId)
      return
    setPendingDelete(false)
    try {
      await remove(activeId)
    }
    catch {
      // error 已写入 store
    }
  }

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-950/80">
      <div className="flex items-center gap-1 border-b border-slate-800 p-2">
        <span className="flex-1 px-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          知识库
        </span>
        <button
          type="button"
          title="引入文档"
          onClick={() => setImportOpen(true)}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          <Plus className="size-3.5" />
        </button>
        {onToggleRecall && (
          <button
            type="button"
            title="召回测试"
            onClick={onToggleRecall}
            className={`rounded-md p-1.5 hover:bg-slate-800 ${
              recallOpen ? 'bg-slate-800 text-sky-300' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Search className="size-3.5" />
          </button>
        )}
        <button
          type="button"
          title="刷新"
          onClick={() => void refresh()}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          <RefreshCw className="size-3.5" />
        </button>
        <button
          type="button"
          title="删除当前文档"
          disabled={!activeId}
          onClick={() => setPendingDelete(true)}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-red-400 disabled:opacity-40"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {pendingDelete && activeId && (
        <div className="space-y-2 border-b border-slate-800 bg-slate-900/80 p-2 text-xs text-slate-300">
          <p>确定删除当前文档？不可恢复。</p>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded bg-red-600/80 px-2 py-1 text-white hover:bg-red-600"
              onClick={() => void onDeleteConfirmed()}
            >
              删除
            </button>
            <button
              type="button"
              className="rounded bg-slate-700 px-2 py-1 hover:bg-slate-600"
              onClick={() => setPendingDelete(false)}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 border-b border-slate-800 p-2">
          {tags.map((tag) => {
            const on = selectedTags.includes(tag.name)
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.name)}
                className={`rounded-full px-2 py-0.5 text-xs ring-1 ring-inset ${
                  on ? 'ring-2 ring-sky-400' : 'ring-slate-700'
                }`}
                style={tag.color
                  ? { backgroundColor: `${tag.color}33`, color: tag.color, borderColor: tag.color }
                  : undefined}
              >
                {tag.name}
              </button>
            )
          })}
          <button
            type="button"
            title="管理标签"
            onClick={() => setTagManagerOpen(true)}
            className="ml-auto rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <Settings2 className="size-3.5" />
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {isLoading && (
          <p className="px-2 py-4 text-sm text-slate-500">加载中…</p>
        )}
        {error != null && (
          <p className="px-2 py-4 text-sm text-red-400">{error}</p>
        )}
        {!isLoading && tree.length === 0 && (
          <p className="px-2 py-4 text-sm text-slate-500">暂无文档</p>
        )}
        <TreeNodes
          nodes={tree}
          depth={0}
          expanded={expanded}
          activeId={activeId}
          onToggle={toggleFolder}
          onSelect={select}
        />
      </div>
      <KbImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
      <KbTagManager open={tagManagerOpen} onClose={() => setTagManagerOpen(false)} />
    </aside>
  )
}
