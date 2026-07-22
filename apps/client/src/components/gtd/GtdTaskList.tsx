import type { EntityRowOf, RenderGroup, RenderItem } from '@agent/gtd'
import { EXPLICIT_STATUS, GROUP_TYPE, renderPerspective, SORT_FIELD } from '@agent/gtd'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useGtd } from '@hooks/useGtd'
import { cn } from '@lib/utils'
import { GtdStore, resolvePerspective } from '@stores/gtd-store'
import { useMemo, useState } from 'react'
import { GtdTaskRow } from './GtdTaskRow'

function isGroup(node: RenderGroup | RenderItem): node is RenderGroup {
  return 'children' in node
}

function taskShape(r: EntityRowOf<'task'>) {
  return { id: r.id, ...r.data }
}

function RenderNodes({
  nodes,
  sortable,
  collapsed,
  hidden,
  parents,
  onToggleCollapsed,
}: {
  nodes: Array<RenderGroup | RenderItem>
  sortable: boolean
  collapsed: Set<string>
  hidden: Set<string>
  parents: Set<string>
  onToggleCollapsed: (taskId: string) => void
}) {
  return (
    <>
      {nodes.map((node) => {
        if (isGroup(node)) {
          return (
            <div key={node.key || 'root'} className="mb-3">
              {node.label
                ? (
                    <div className="mb-1 px-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                      {node.label}
                    </div>
                  )
                : null}
              <RenderNodes
                nodes={node.children}
                sortable={sortable}
                collapsed={collapsed}
                hidden={hidden}
                parents={parents}
                onToggleCollapsed={onToggleCollapsed}
              />
            </div>
          )
        }
        if (hidden.has(node.taskId))
          return null
        return (
          <GtdTaskRow
            key={node.taskId}
            taskId={node.taskId}
            depth={node.depth}
            computed={node.computed}
            sortable={sortable}
            hasChildren={parents.has(node.taskId)}
            collapsed={collapsed.has(node.taskId)}
            onToggleCollapsed={() => onToggleCollapsed(node.taskId)}
          />
        )
      })}
    </>
  )
}

export function GtdTaskList() {
  const {
    rowStore,
    selection,
    isLoading,
    addInboxTask,
    addProjectTask,
    reorderTask,
    patchProject,
  } = useGtd()
  const [draft, setDraft] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const perspective = useMemo(() => resolvePerspective(rowStore, selection), [rowStore, selection])
  const selectedProject = selection.kind === 'project'
    ? rowStore.findLive('project', selection.id) ?? null
    : null
  const title = useMemo(() => {
    if (selection.kind === 'perspective')
      return perspective.name
    if (selection.kind === 'project')
      return selectedProject?.data.name ?? '项目'
    if (selection.kind === 'tag')
      return rowStore.findLive('tag', selection.id)?.data.name ?? '标签'
    return rowStore.findLive('folder', selection.id)?.data.name ?? '文件夹'
  }, [rowStore, selection, perspective.name, selectedProject?.data.name])
  const liveTasks = useMemo(() => rowStore.liveTasks(), [rowStore])

  const tree = useMemo(() => {
    return renderPerspective(rowStore, perspective, new Date(), GtdStore.dueSoonMs)
  }, [rowStore, perspective])
  const visibleTaskIds = useMemo(() => {
    const ids: string[] = []
    const visit = (nodes: Array<RenderGroup | RenderItem>) => {
      for (const node of nodes) {
        if (isGroup(node))
          visit(node.children)
        else if (!ids.includes(node.taskId))
          ids.push(node.taskId)
      }
    }
    visit(tree)
    return ids
  }, [tree])
  const parentTaskIds = useMemo(
    () => new Set(liveTasks.flatMap(task => task.data.parentId ? [task.data.parentId] : [])),
    [liveTasks],
  )
  const hiddenTaskIds = useMemo(() => {
    const hidden = new Set<string>()
    const byId = new Map(liveTasks.map(t => [t.id, t]))
    for (const task of liveTasks) {
      let parentId = task.data.parentId
      while (parentId) {
        if (collapsed.has(parentId)) {
          hidden.add(task.id)
          break
        }
        parentId = byId.get(parentId)?.data.parentId ?? null
      }
    }
    return hidden
  }, [collapsed, liveTasks])
  const activeCount = liveTasks.filter(t => t.data.status === EXPLICIT_STATUS.ACTIVE).length

  const canQuickAdd
    = (selection.kind === 'perspective' && selection.id === 'inbox')
      || selection.kind === 'project'
  const canManualReorder
    = perspective.sortBy[0]?.field === SORT_FIELD.ORDER
      && (
        selection.kind === 'project'
        || (selection.kind === 'perspective' && selection.id === 'inbox')
      )

  const onAdd = () => {
    const name = draft.trim()
    if (!name)
      return
    if (selection.kind === 'project')
      addProjectTask(selection.id, name)
    else
      addInboxTask(name)
    setDraft('')
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-slate-100">{title}</h1>
          <p className="text-xs text-slate-500">
            {isLoading ? '加载中…' : `${activeCount} 个活跃任务`}
          </p>
        </div>
        {selectedProject && (
          <div className="flex shrink-0 rounded-lg border border-slate-700 bg-slate-900/60 p-0.5">
            {([
              [GROUP_TYPE.SEQUENTIAL, '顺序'],
              [GROUP_TYPE.PARALLEL, '并行'],
              [GROUP_TYPE.SINGLE_ACTION, '清单'],
            ] as const).map(([type, label]) => (
              <button
                key={type}
                type="button"
                className={cn(
                  'h-8 rounded-md px-3 text-xs text-slate-400 transition-colors',
                  selectedProject.data.type === type && 'bg-slate-700 text-slate-100',
                )}
                onClick={() => patchProject(selectedProject.id, { type })}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </header>

      {canQuickAdd && (
        <div className="flex shrink-0 gap-2 border-b border-slate-800 px-4 py-2">
          <Input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter')
                onAdd()
            }}
            placeholder={selection.kind === 'project' ? '添加任务…' : '捕捉到收件箱…'}
            className="border-slate-700 bg-slate-900/50"
          />
          <Button type="button" className="h-9" onClick={onAdd} disabled={!draft.trim()}>
            添加
          </Button>
        </div>
      )}

      <DndContext
        sensors={sensors}
        onDragEnd={({ active, over }) => {
          if (!over || active.id === over.id)
            return
          const task = rowStore.findLive('task', String(active.id))
          const overTask = rowStore.findLive('task', String(over.id))
          if (
            !task
            || !overTask
            || task.data.projectId !== overTask.data.projectId
            || task.data.parentId !== overTask.data.parentId
          ) {
            return
          }
          const siblings = liveTasks
            .filter(t =>
              t.data.projectId === task.data.projectId && t.data.parentId === task.data.parentId,
            )
            .map(taskShape)
            .sort((a, b) => a.order - b.order)
          const oldIndex = siblings.findIndex(t => t.id === task.id)
          const newIndex = siblings.findIndex(t => t.id === overTask.id)
          const moved = arrayMove(siblings, oldIndex, newIndex)
          const index = moved.findIndex(t => t.id === task.id)
          reorderTask(task.id, {
            beforeId: moved[index - 1]?.id ?? null,
            afterId: moved[index + 1]?.id ?? null,
          })
        }}
      >
        <SortableContext
          items={visibleTaskIds}
          strategy={verticalListSortingStrategy}
          disabled={!canManualReorder}
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {tree.length === 0
              ? (
                  <p className="px-2 py-8 text-center text-sm text-slate-500">暂无任务</p>
                )
              : (
                  <RenderNodes
                    nodes={tree}
                    sortable={canManualReorder}
                    collapsed={collapsed}
                    hidden={hiddenTaskIds}
                    parents={parentTaskIds}
                    onToggleCollapsed={(taskId) => {
                      setCollapsed((current) => {
                        const next = new Set(current)
                        if (next.has(taskId))
                          next.delete(taskId)
                        else
                          next.add(taskId)
                        return next
                      })
                    }}
                  />
                )}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}
