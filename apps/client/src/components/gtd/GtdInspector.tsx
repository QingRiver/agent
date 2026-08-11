import type { PerspectiveEntityRef } from '@agent/gtd'
import type { DirDto } from '@apis/dir-api'
import { EXPLICIT_STATUS, GROUP_TYPE, PLANNED_MODE } from '@agent/gtd'
import { GTD_TIME_END_OF_DAY, GTD_TIME_START_OF_DAY, startOfLocalDayIso } from '@components/gtd/gtd-datetime'
import { GtdDateTimeField } from '@components/gtd/GtdDateTimeField'
import { GtdRepeatEditor } from '@components/gtd/GtdRepeatEditor'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Select } from '@components/ui/select'
import { useGtd } from '@hooks/useGtd'
import { DirStore } from '@stores/dir-store'
import { useAtomValue } from 'jotai'
import { useState } from 'react'

export function GtdInspector() {
  const {
    rowStore,
    selectedTaskId,
    selectedProjectId,
    selection,
    patchTask,
    setTaskPlanned,
    dropTask,
    restoreTask,
    deleteTaskLogical,
    reopenTask,
    completeTask,
    toggleFlag,
    addChildTask,
    indentTask,
    outdentTask,
    setTaskGroupType,
    setTaskRepeat,
    setTaskTags,
    renameDir,
    removeProject,
    removeFolder,
    selectProjectForInspector,
  } = useGtd()
  const [childName, setChildName] = useState('')

  const dirsById = useAtomValue(DirStore.dirsByIdAtom)
  const projectRoots = useAtomValue(DirStore.projectRefsAtom) as PerspectiveEntityRef[]

  const task = selectedTaskId ? rowStore.findLive('task', selectedTaskId) : null
  // project 退出 GTD sync，dir 信息来自 DirStore（dirsById 投影）
  const dirId = selectedProjectId
    ?? (selection.kind === 'project' ? selection.id : null)
  const dir = !task && dirId ? dirsById.get(dirId) ?? null : null

  if (task) {
    const done = task.data.status === EXPLICIT_STATUS.COMPLETED
    const dropped = task.data.status === EXPLICIT_STATUS.HOLD
    const tagIds = rowStore.tagIdsOf(task.id)
    const taskChildren = rowStore.liveTasks().filter(t => t.data.parentId === task.id)
    const repeatRule = task.data.repeatRule ?? null
    // projectId 退出 LWW（server 派生），此处按 mountDirId 派生展示；改项目 = 改 mountDirId
    const derivedProjectId = DirStore.projectOf(dirsById, task.data.mountDirId)
    const mounted = task.data.mountDirId != null

    return (
      <aside className="flex w-72 shrink-0 flex-col border-l border-border bg-card">
        <div className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          任务
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">名称</Label>
            <Input
              value={task.data.name}
              onChange={e => patchTask(task.id, { name: e.target.value || task.data.name })}
              className="border-border bg-muted"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">备注</Label>
            <textarea
              value={task.data.note ?? ''}
              onChange={e => patchTask(task.id, { note: e.target.value || null })}
              rows={4}
              className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">项目</Label>
            <Select
              value={derivedProjectId ?? ''}
              disabled={!!task.data.parentId}
              onChange={e => patchTask(task.id, { mountDirId: e.target.value || null })}
            >
              <option value="">收件箱</option>
              {projectRoots.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">标签</Label>
            <div className="flex flex-wrap gap-1">
              {rowStore.liveTags().map((tag) => {
                const on = tagIds.includes(tag.id)
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => {
                      const next = on
                        ? tagIds.filter(id => id !== tag.id)
                        : [...tagIds, tag.id]
                      setTaskTags(task.id, next)
                    }}
                    className={`min-h-8 rounded-md px-2 py-1 text-xs ${
                      on ? 'bg-accent text-accent-foreground' : 'bg-card text-muted-foreground'
                    }`}
                  >
                    {tag.data.name}
                  </button>
                )
              })}
              {rowStore.liveTags().length === 0 && (
                <span className="text-xs text-muted-foreground">暂无标签</span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2">
            <GtdDateTimeField
              label="推迟"
              value={task.data.deferDate}
              defaultTime={GTD_TIME_START_OF_DAY}
              onChange={iso => patchTask(task.id, { deferDate: iso })}
            />
            <GtdDateTimeField
              label="截止"
              value={task.data.dueDate}
              defaultTime={GTD_TIME_END_OF_DAY}
              onChange={iso => patchTask(task.id, { dueDate: iso })}
            />
          </div>
          <div className="space-y-2 rounded-lg border border-border bg-muted p-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs text-muted-foreground">计划</Label>
              <div className="w-40 shrink-0">
                <Select
                  value={task.data.plannedMode ?? PLANNED_MODE.NONE}
                  onChange={(e) => {
                    const mode = e.target.value as typeof PLANNED_MODE[keyof typeof PLANNED_MODE]
                    if (mode === PLANNED_MODE.ON) {
                      setTaskPlanned(
                        task.id,
                        mode,
                        task.data.plannedDate ?? startOfLocalDayIso(),
                      )
                      return
                    }
                    setTaskPlanned(task.id, mode, null)
                  }}
                >
                  <option value={PLANNED_MODE.NONE}>无</option>
                  <option value={PLANNED_MODE.ROLLING}>滚动到今日</option>
                  <option value={PLANNED_MODE.ON}>选日期</option>
                </Select>
              </div>
            </div>
            {(task.data.plannedMode ?? PLANNED_MODE.NONE) === PLANNED_MODE.ON && (
              <GtdDateTimeField
                label="计划日"
                value={task.data.plannedDate}
                defaultTime={GTD_TIME_START_OF_DAY}
                onChange={iso => setTaskPlanned(task.id, PLANNED_MODE.ON, iso)}
              />
            )}
          </div>
          <section className="space-y-2 rounded-lg border border-border bg-muted p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-foreground">任务结构</div>
                <div className="text-[11px] text-muted-foreground">
                  {taskChildren.length > 0 ? `${taskChildren.length} 个直接子任务` : '普通任务'}
                </div>
              </div>
              <div className="w-40 shrink-0">
                <Select
                  value={task.data.groupType ?? ''}
                  onChange={e =>
                    setTaskGroupType(task.id, (e.target.value || null) as typeof task.data.groupType)}
                >
                  <option value="" disabled={taskChildren.length > 0}>普通任务</option>
                  <option value={GROUP_TYPE.PARALLEL}>并行任务组</option>
                  <option value={GROUP_TYPE.SEQUENTIAL}>串行任务组</option>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-9 flex-1"
                disabled={!mounted}
                onClick={() => indentTask(task.id)}
              >
                缩进
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-9 flex-1"
                disabled={!task.data.parentId}
                onClick={() => outdentTask(task.id)}
              >
                出缩进
              </Button>
            </div>
            <div className="flex gap-2">
              <Input
                value={childName}
                disabled={!mounted}
                placeholder={mounted ? '添加子任务…' : '先将任务移入项目'}
                onChange={e => setChildName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && childName.trim()) {
                    addChildTask(task.id, childName)
                    setChildName('')
                  }
                }}
              />
              <Button
                type="button"
                className="h-9 shrink-0"
                disabled={!mounted || !childName.trim()}
                onClick={() => {
                  addChildTask(task.id, childName)
                  setChildName('')
                }}
              >
                添加
              </Button>
            </div>
          </section>
          <GtdRepeatEditor
            key={`${task.id}:${repeatRule?.id ?? 'none'}`}
            rule={repeatRule}
            hasDueDate={task.data.dueDate != null}
            hasDeferDate={task.data.deferDate != null}
            onSave={input => setTaskRepeat(task.id, input)}
          />
          <div className="flex flex-wrap gap-2 pt-2">
            <Button type="button" className="h-9" variant="outline" onClick={() => toggleFlag(task.id)}>
              {task.data.flagged ? '取消旗标' : '旗标'}
            </Button>
            {done
              ? (
                  <Button type="button" className="h-9" variant="outline" onClick={() => reopenTask(task.id)}>
                    重开
                  </Button>
                )
              : dropped
                ? (
                    <Button type="button" className="h-9" variant="outline" onClick={() => restoreTask(task.id)}>
                      恢复
                    </Button>
                  )
                : (
                    <>
                      <Button type="button" className="h-9" variant="outline" onClick={() => completeTask(task.id)}>
                        完成
                      </Button>
                      <Button type="button" className="h-9" variant="outline" onClick={() => dropTask(task.id)}>
                        放弃
                      </Button>
                      {/* deleteTask command 仅 ACTIVE 可删（SP-STATE-6）；completed/hold 须先 reopen/restore 回 ACTIVE */}
                      <Button type="button" className="h-9" variant="ghost" onClick={() => deleteTaskLogical(task.id)}>
                        删除
                      </Button>
                    </>
                  )}
          </div>
        </div>
      </aside>
    )
  }

  if (dir) {
    return (
      <DirInspector
        key={dir.id}
        dir={dir}
        onRename={renameDir}
        onDelete={dir.kind === 'project' ? removeProject : removeFolder}
        onFocus={dir.kind === 'project' ? () => selectProjectForInspector(dir.id) : undefined}
        showFocus={selection.kind !== 'project' && selectedProjectId == null}
      />
    )
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-border bg-card">
      <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-muted-foreground">
        选择任务或项目以编辑详情
      </div>
    </aside>
  )
}

/**
 * Dir 检视器（project 根 / dir 子节点通用）。
 * project facet 全弃用，仅剩重命名 + 删除。重命名走在线 API，按 blur/Enter 提交
 * （避免逐键请求）；dir 切换靠 key 重置本地名状态。
 */
function DirInspector({
  dir,
  onRename,
  onDelete,
  onFocus,
  showFocus,
}: {
  dir: DirDto
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onFocus?: () => void
  showFocus: boolean
}) {
  const [name, setName] = useState(dir.name)

  const commit = () => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== dir.name)
      onRename(dir.id, trimmed)
    else
      setName(dir.name)
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {dir.kind === 'project' ? '项目' : '文件夹'}
        </span>
        {showFocus && onFocus && (
          <button
            type="button"
            className="text-[10px] text-muted-foreground hover:text-foreground"
            onClick={onFocus}
          >
            聚焦
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">名称</Label>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter')
                commit()
            }}
            className="border-border bg-muted"
          />
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button type="button" className="h-9" variant="ghost" onClick={() => onDelete(dir.id)}>
            删除
          </Button>
        </div>
      </div>
    </aside>
  )
}
