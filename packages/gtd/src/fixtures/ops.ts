/**
 * 测试里拼 Op。行级工厂见 factories.ts。
 */
import type { EntityRow, GtdEntity } from '../data/row-schema'
import type { Task } from '../data/schema'
import type { Op } from '../op'
import type { StatusAction } from '../transition'
import { NOW_ISO } from './constants'

/** 测试里常用的「当前时刻」别名（= NOW_ISO）。 */
export const SYNC_NOW = NOW_ISO

interface Stamp {
  id?: string
  clientTs?: string
}

function stamped(draft: Stamp, fallbackId: string): { id: string, clientTs: string } {
  return { id: draft.id ?? fallbackId, clientTs: draft.clientTs ?? SYNC_NOW }
}

export function makeTransition(draft: Stamp & { action?: StatusAction, taskId: string }): Op {
  const { id, clientTs } = stamped(draft, 'c1')
  return { kind: 'transition', id, clientTs, action: draft.action ?? 'complete', taskId: draft.taskId }
}

export function makeCreate(draft: Stamp & {
  taskId: string
  name: string
  parentId: string | null
  order: number
  mountDirId: string | null
}): Op {
  const { id, clientTs } = stamped(draft, 'c1')
  return {
    kind: 'create',
    id,
    clientTs,
    taskId: draft.taskId,
    name: draft.name,
    parentId: draft.parentId,
    order: draft.order,
    mountDirId: draft.mountDirId,
  }
}

export function makeMove(draft: Stamp & { taskId: string, parentId: string | null, order: number }): Op {
  const { id, clientTs } = stamped(draft, 'c1')
  return { kind: 'move', id, clientTs, taskId: draft.taskId, parentId: draft.parentId, order: draft.order }
}

export function makePatch(draft: Stamp & {
  entity?: GtdEntity
  entityId: string
  patch: Partial<Task> | { taskId: string, tagId: string }
}): Op {
  const { id, clientTs } = stamped(draft, 'm1')
  return { kind: 'patch', id, clientTs, entity: draft.entity ?? 'task', entityId: draft.entityId, patch: draft.patch } as Op
}

export function makeDelete(draft: Stamp & { entity?: GtdEntity, entityId: string }): Op {
  const { id, clientTs } = stamped(draft, 'm1')
  return { kind: 'delete', id, clientTs, entity: draft.entity ?? 'task', entityId: draft.entityId }
}

export function findRow(rows: EntityRow[], entity: GtdEntity, id: string): EntityRow | undefined {
  return rows.find(r => r.entity === entity && r.id === id)
}

export function field<T>(row: EntityRow | undefined, key: string): T | undefined {
  return row ? ((row.data as Record<string, unknown>)[key] as T | undefined) : undefined
}
