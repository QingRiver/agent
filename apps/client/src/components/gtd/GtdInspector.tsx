import { EXPLICIT_STATUS, GROUP_TYPE } from '@agent/gtd'
import { GtdDateTimeField } from '@components/gtd/GtdDateTimeField'
import { GtdRepeatEditor } from '@components/gtd/GtdRepeatEditor'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Select } from '@components/ui/select'
import { useGtd } from '@hooks/useGtd'
import { useState } from 'react'

export function GtdInspector() {
  const {
    rowStore,
    selectedTaskId,
    selectedProjectId,
    selection,
    patchTask,
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
    patchProject,
    holdProject,
    resumeProject,
    markProjectReviewed,
    removeProject,
    selectProjectForInspector,
  } = useGtd()
  const [childName, setChildName] = useState('')

  const task = selectedTaskId ? rowStore.findLive('task', selectedTaskId) : null
  const projectId = selectedProjectId
    ?? (selection.kind === 'project' ? selection.id : null)
    ?? task?.data.projectId
    ?? null
  const project = projectId && !task
    ? rowStore.findLive('project', projectId)
    : (selectedProjectId ? rowStore.findLive('project', selectedProjectId) : null)
  const taskChildren = task ? rowStore.liveTasks().filter(t => t.data.parentId === task.id) : []
  const repeatRule = task?.data.repeatRule ?? null

  if (task) {
    const done = task.data.status === EXPLICIT_STATUS.COMPLETED
    const dropped = task.data.status === EXPLICIT_STATUS.CANCELLED
    const tagIds = rowStore.tagIdsOf(task.id)

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
              value={task.data.projectId ?? ''}
              onChange={e => patchTask(task.id, { projectId: e.target.value || null })}
            >
              <option value="">收件箱</option>
              {rowStore.liveProjects().map(p => (
                <option key={p.id} value={p.id}>{p.data.name}</option>
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
              onChange={iso => patchTask(task.id, { deferDate: iso })}
            />
            <GtdDateTimeField
              label="截止"
              value={task.data.dueDate}
              onChange={iso => patchTask(task.id, { dueDate: iso })}
            />
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
                  <option value={GROUP_TYPE.SINGLE_ACTION}>单动作清单</option>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-9 flex-1"
                disabled={!task.data.projectId}
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
                disabled={!task.data.projectId}
                placeholder={task.data.projectId ? '添加子任务…' : '先将任务移入项目'}
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
                disabled={!task.data.projectId || !childName.trim()}
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
                    </>
                  )}
            <Button type="button" className="h-9" variant="ghost" onClick={() => deleteTaskLogical(task.id)}>
              删除
            </Button>
          </div>
        </div>
      </aside>
    )
  }

  if (project) {
    const onHold = project.data.status === EXPLICIT_STATUS.ON_HOLD
    return (
      <aside className="flex w-72 shrink-0 flex-col border-l border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">项目</span>
          {selection.kind !== 'project' && (
            <button
              type="button"
              className="text-[10px] text-muted-foreground hover:text-foreground"
              onClick={() => selectProjectForInspector(project.id)}
            >
              聚焦
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">名称</Label>
            <Input
              value={project.data.name}
              onChange={e => patchProject(project.id, { name: e.target.value || project.data.name })}
              className="border-border bg-muted"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">备注</Label>
            <textarea
              value={project.data.note ?? ''}
              onChange={e => patchProject(project.id, { note: e.target.value || null })}
              rows={4}
              className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">类型</Label>
            <Select
              value={project.data.type}
              onChange={e =>
                patchProject(project.id, { type: e.target.value as typeof project.data.type })}
            >
              <option value="sequential">顺序</option>
              <option value="parallel">并行</option>
              <option value="singleAction">单动作清单</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">文件夹</Label>
            <Select
              value={project.data.folderId ?? ''}
              onChange={e => patchProject(project.id, { folderId: e.target.value || null })}
            >
              <option value="">无</option>
              {rowStore.liveFolders().map(f => (
                <option key={f.id} value={f.id}>{f.data.name}</option>
              ))}
            </Select>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            {onHold
              ? (
                  <Button type="button" className="h-9" variant="outline" onClick={() => resumeProject(project.id)}>
                    恢复
                  </Button>
                )
              : (
                  <Button type="button" className="h-9" variant="outline" onClick={() => holdProject(project.id)}>
                    暂停
                  </Button>
                )}
            <Button type="button" className="h-9" variant="outline" onClick={() => markProjectReviewed(project.id)}>
              标记已回顾
            </Button>
            <Button type="button" className="h-9" variant="ghost" onClick={() => removeProject(project.id)}>
              删除项目
            </Button>
          </div>
        </div>
      </aside>
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
