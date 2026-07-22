import type { GtdDocument, Task } from './schema'
import { applyRepeatOnComplete } from './repeat'
import { EXPLICIT_STATUS } from './types'

/**
 * 状态机转换（纯函数，返回新 doc，不改原 doc）。
 */

function findTask(doc: GtdDocument, taskId: string): Task {
  const t = doc.tasks.find(x => x.id === taskId)
  if (!t)
    throw new Error(`task not found: ${taskId}`)
  return t
}

function mapTask(doc: GtdDocument, taskId: string, fn: (t: Task) => Task): GtdDocument {
  return { ...doc, tasks: doc.tasks.map(t => (t.id === taskId ? fn(t) : t)) }
}

/** 标记完成：status→completed + completedAt；若有 RepeatRule 触发 applyRepeatOnComplete */
export function complete(doc: GtdDocument, taskId: string, now: Date): GtdDocument {
  const t = findTask(doc, taskId)
  if (t.status !== EXPLICIT_STATUS.ACTIVE)
    throw new Error(`complete 仅允许从 active 转换，当前: ${t.status}`)
  const updated = mapTask(doc, taskId, t => ({
    ...t,
    status: EXPLICIT_STATUS.COMPLETED,
    completedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }))
  const completed = updated.tasks.find(x => x.id === taskId)!
  return applyRepeatOnComplete(updated, completed, now)
}

/** 放弃（dropped）：status→cancelled + droppedAt */
export function drop(doc: GtdDocument, taskId: string, now: Date): GtdDocument {
  return mapTask(doc, taskId, t => ({
    ...t,
    status: EXPLICIT_STATUS.CANCELLED,
    droppedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }))
}

/** 逻辑删除：status→deleted + droppedAt（不从 JSON 移除） */
export function deleteTask(doc: GtdDocument, taskId: string, now: Date = new Date()): GtdDocument {
  return mapTask(doc, taskId, t => ({
    ...t,
    status: EXPLICIT_STATUS.DELETED,
    droppedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }))
}

/** Project 暂停：status→on_hold（子 Task 派生 blocked） */
export function hold(doc: GtdDocument, projectId: string): GtdDocument {
  return {
    ...doc,
    projects: doc.projects.map(p =>
      p.id === projectId ? { ...p, status: EXPLICIT_STATUS.ON_HOLD } : p,
    ),
  }
}

/** Project 恢复：status→active */
export function resume(doc: GtdDocument, projectId: string): GtdDocument {
  return {
    ...doc,
    projects: doc.projects.map(p =>
      p.id === projectId ? { ...p, status: EXPLICIT_STATUS.ACTIVE } : p,
    ),
  }
}

/** 取消完成（重开）：status→active + completedAt=null */
export function reopen(doc: GtdDocument, taskId: string): GtdDocument {
  return mapTask(doc, taskId, t => ({
    ...t,
    status: EXPLICIT_STATUS.ACTIVE,
    completedAt: null,
    updatedAt: new Date().toISOString(),
  }))
}

/** 恢复已放弃：status→active + droppedAt=null */
export function restore(doc: GtdDocument, taskId: string): GtdDocument {
  return mapTask(doc, taskId, t => ({
    ...t,
    status: EXPLICIT_STATUS.ACTIVE,
    droppedAt: null,
    updatedAt: new Date().toISOString(),
  }))
}
