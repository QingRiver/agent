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
    doc,
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
    patchProject,
    holdProject,
    resumeProject,
    markProjectReviewed,
    removeProject,
    selectProjectForInspector,
  } = useGtd()
  const [childName, setChildName] = useState('')

  const task = selectedTaskId ? doc.tasks.find(t => t.id === selectedTaskId) : null
  const projectId = selectedProjectId
    ?? (selection.kind === 'project' ? selection.id : null)
    ?? task?.projectId
    ?? null
  const project = projectId && !task
    ? doc.projects.find(p => p.id === projectId)
    : (selectedProjectId ? doc.projects.find(p => p.id === selectedProjectId) : null)
  const taskChildren = task ? doc.tasks.filter(t => t.parentId === task.id) : []
  const repeatRule = task?.repeatRuleId
    ? doc.repeatRules.find(rule => rule.id === task.repeatRuleId) ?? null
    : null

  if (task) {
    const done = task.status === EXPLICIT_STATUS.COMPLETED
    const dropped = task.status === EXPLICIT_STATUS.CANCELLED

    return (
      <aside className="flex w-72 shrink-0 flex-col border-l border-slate-800 bg-slate-950/60">
        <div className="border-b border-slate-800 px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          任务
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">名称</Label>
            <Input
              value={task.name}
              onChange={e => patchTask(task.id, { name: e.target.value || task.name })}
              className="border-slate-700 bg-slate-900/50"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">备注</Label>
            <textarea
              value={task.note ?? ''}
              onChange={e => patchTask(task.id, { note: e.target.value || null })}
              rows={4}
              className="w-full rounded-md border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm text-slate-200"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">项目</Label>
            <Select
              value={task.projectId ?? ''}
              onChange={e => patchTask(task.id, { projectId: e.target.value || null })}
            >
              <option value="">收件箱</option>
              {doc.projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">标签</Label>
            <div className="flex flex-wrap gap-1">
              {doc.tags.map((tag) => {
                const on = task.tagIds.includes(tag.id)
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => {
                      const tagIds = on
                        ? task.tagIds.filter(id => id !== tag.id)
                        : [...task.tagIds, tag.id]
                      patchTask(task.id, { tagIds })
                    }}
                    className={`min-h-8 rounded-md px-2 py-1 text-xs ${
                      on ? 'bg-slate-700 text-slate-100' : 'bg-slate-900 text-slate-500'
                    }`}
                  >
                    {tag.name}
                  </button>
                )
              })}
              {doc.tags.length === 0 && (
                <span className="text-xs text-slate-600">暂无标签</span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2">
            <GtdDateTimeField
              label="推迟"
              value={task.deferDate}
              onChange={iso => patchTask(task.id, { deferDate: iso })}
            />
            <GtdDateTimeField
              label="截止"
              value={task.dueDate}
              onChange={iso => patchTask(task.id, { dueDate: iso })}
            />
          </div>
          <section className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/30 p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-slate-300">任务结构</div>
                <div className="text-[11px] text-slate-500">
                  {taskChildren.length > 0 ? `${taskChildren.length} 个直接子任务` : '普通任务'}
                </div>
              </div>
              <div className="w-40 shrink-0">
                <Select
                  value={task.groupType ?? ''}
                  onChange={e =>
                    setTaskGroupType(task.id, (e.target.value || null) as typeof task.groupType)}
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
                disabled={!task.projectId}
                onClick={() => indentTask(task.id)}
              >
                缩进
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-9 flex-1"
                disabled={!task.parentId}
                onClick={() => outdentTask(task.id)}
              >
                出缩进
              </Button>
            </div>
            <div className="flex gap-2">
              <Input
                value={childName}
                disabled={!task.projectId}
                placeholder={task.projectId ? '添加子任务…' : '先将任务移入项目'}
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
                disabled={!task.projectId || !childName.trim()}
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
            hasDueDate={task.dueDate != null}
            hasDeferDate={task.deferDate != null}
            onSave={input => setTaskRepeat(task.id, input)}
          />
          <div className="flex flex-wrap gap-2 pt-2">
            <Button type="button" className="h-9" variant="outline" onClick={() => toggleFlag(task.id)}>
              {task.flagged ? '取消旗标' : '旗标'}
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
    const onHold = project.status === EXPLICIT_STATUS.ON_HOLD
    return (
      <aside className="flex w-72 shrink-0 flex-col border-l border-slate-800 bg-slate-950/60">
        <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">项目</span>
          {selection.kind !== 'project' && (
            <button
              type="button"
              className="text-[10px] text-slate-500 hover:text-slate-300"
              onClick={() => selectProjectForInspector(project.id)}
            >
              聚焦
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">名称</Label>
            <Input
              value={project.name}
              onChange={e => patchProject(project.id, { name: e.target.value || project.name })}
              className="border-slate-700 bg-slate-900/50"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">备注</Label>
            <textarea
              value={project.note ?? ''}
              onChange={e => patchProject(project.id, { note: e.target.value || null })}
              rows={4}
              className="w-full rounded-md border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm text-slate-200"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">类型</Label>
            <Select
              value={project.type}
              onChange={e =>
                patchProject(project.id, { type: e.target.value as typeof project.type })}
            >
              <option value="sequential">顺序</option>
              <option value="parallel">并行</option>
              <option value="singleAction">单动作清单</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">文件夹</Label>
            <Select
              value={project.folderId ?? ''}
              onChange={e => patchProject(project.id, { folderId: e.target.value || null })}
            >
              <option value="">无</option>
              {doc.folders.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
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
    <aside className="flex w-72 shrink-0 flex-col border-l border-slate-800 bg-slate-950/40">
      <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-slate-600">
        选择任务或项目以编辑详情
      </div>
    </aside>
  )
}
