import type { EntityRowOf, ForecastStripKey, RenderGroup, RenderItem } from '@agent/gtd'
import {
  EXPLICIT_STATUS,
  FORECAST_STRIP_ORDER,
  FORECAST_STRIP_TEXT,
  renderPerspective,
  SORT_FIELD,
  stripToForecastOptions,
} from '@agent/gtd'
import { Button } from '@components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu'
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
import { DirStore } from '@stores/dir-store'
import { GtdStore, resolvePerspective } from '@stores/gtd-store'
import { useAtomValue } from 'jotai'
import { Settings2 } from 'lucide-react'
import { useState } from 'react'
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
  stickyHeaders,
  onToggleCollapsed,
}: {
  nodes: Array<RenderGroup | RenderItem>
  sortable: boolean
  collapsed: Set<string>
  hidden: Set<string>
  parents: Set<string>
  stickyHeaders: boolean
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
                    <div
                      className={cn(
                        'mb-1 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground',
                        stickyHeaders && 'sticky top-0 z-10 bg-background/95 py-1 backdrop-blur-sm',
                      )}
                    >
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
                stickyHeaders={stickyHeaders}
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
    forecastStrip,
    forecastSignals,
    isLoading,
    addInboxTask,
    addProjectTask,
    reorderTask,
    toggleForecastStripSegment,
    patchForecastSignals,
  } = useGtd()
  const [draft, setDraft] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const dirsById = useAtomValue(DirStore.dirsByIdAtom)
  const perspective = resolvePerspective(rowStore, selection)
  const isForecast = selection.kind === 'perspective' && selection.id === 'forecast'
  // Phase 1：project/folder 退出 GTD sync，名称来自 DirStore dirsById 投影
  const selectedDir = (selection.kind === 'project' || selection.kind === 'folder')
    ? dirsById.get(selection.id) ?? null
    : null

  function resolveTitle() {
    if (selection.kind === 'perspective')
      return perspective.name
    if (selection.kind === 'project' || selection.kind === 'folder')
      return selectedDir?.name ?? (selection.kind === 'project' ? '项目' : '文件夹')
    if (selection.kind === 'tag')
      return rowStore.findLive('tag', selection.id)?.data.name ?? '标签'
    return '文件夹'
  }
  const title = resolveTitle()
  const liveTasks = rowStore.liveTasks()

  // perspective 渲染需要墙钟「现在」与用户时区日界
  // eslint-disable-next-line react/purity -- wall-clock now for due/soon grouping
  const now = new Date()
  const timeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const forecastOptions = isForecast
    ? stripToForecastOptions(forecastStrip, forecastSignals, now, timeZone)
    : undefined
  const tree = renderPerspective(rowStore, perspective, now, GtdStore.dueSoonMs, timeZone, forecastOptions)

  function collectVisibleTaskIds() {
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
  }
  const visibleTaskIds = collectVisibleTaskIds()
  const parentTaskIds = new Set(liveTasks.flatMap(task => task.data.parentId ? [task.data.parentId] : []))

  function collectHiddenTaskIds() {
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
  }
  const hiddenTaskIds = collectHiddenTaskIds()
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

  const stripSelected = new Set(forecastStrip)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-col gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-foreground">{title}</h1>
            <p className="text-xs text-muted-foreground">
              {isLoading ? '加载中…' : `${activeCount} 个活跃任务`}
            </p>
          </div>
          {isForecast && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" className="size-8 shrink-0 p-0" title="信号开关">
                  <Settings2 className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>包含信号</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(
                  [
                    ['includeOverdue', '逾期'],
                    ['includeDue', '截止'],
                    ['includeDeferred', '推迟'],
                    ['includePlanned', '计划'],
                    ['includeFlagged', '旗标'],
                  ] as const
                ).map(([key, label]) => (
                  <DropdownMenuCheckboxItem
                    key={key}
                    checked={forecastSignals[key]}
                    onCheckedChange={v => patchForecastSignals({ [key]: v === true })}
                  >
                    {label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {isForecast && (
          <div className="flex rounded-lg border border-border bg-muted p-0.5">
            {FORECAST_STRIP_ORDER.map((key) => {
              const active = stripSelected.has(key as ForecastStripKey)
              return (
                <button
                  key={key}
                  type="button"
                  className={cn(
                    'h-8 flex-1 rounded-md px-2 text-xs text-muted-foreground transition-colors',
                    active && 'bg-accent text-accent-foreground',
                  )}
                  onClick={() => toggleForecastStripSegment(key as ForecastStripKey)}
                >
                  {FORECAST_STRIP_TEXT[key]}
                </button>
              )
            })}
          </div>
        )}
      </header>

      {canQuickAdd && (
        <div className="flex shrink-0 gap-2 border-b border-border px-4 py-2">
          <Input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter')
                onAdd()
            }}
            placeholder={selection.kind === 'project' ? '添加任务…' : '捕捉到收件箱…'}
            className="border-border bg-muted"
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
            || task.data.mountDirId !== overTask.data.mountDirId
            || task.data.parentId !== overTask.data.parentId
          ) {
            return
          }
          const siblings = liveTasks
            .filter(t =>
              t.data.mountDirId === task.data.mountDirId && t.data.parentId === task.data.parentId,
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
                  <p className="px-2 py-8 text-center text-sm text-muted-foreground">暂无任务</p>
                )
              : (
                  <RenderNodes
                    nodes={tree}
                    sortable={canManualReorder}
                    collapsed={collapsed}
                    hidden={hiddenTaskIds}
                    parents={parentTaskIds}
                    stickyHeaders={isForecast}
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
