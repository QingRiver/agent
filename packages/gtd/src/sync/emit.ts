/**
 * 本地操作 → 一条事务的写入。
 *
 * 在本机当前看见的行上依次执行这次操作的全部意图（状态机命令、字段补丁、永久删除），
 * 再把前后差异整理成写入。重开时只有本机看见父任务已完成，才会写父任务——没看见的就不替别人做决定。
 */
import type { EntityRow, GtdCommand, GtdMutation } from '../data/sync-schema'
import type { Write } from './txn'
import { isEqual } from 'radash'
import { taskLabel, taskNotFound } from '../command/errors'
import { repeatSuccessorId } from '../command/repeat'
import { EXPLICIT_STATUS } from '../data/types'
import { applyCommand, applyMutation } from './intent'
import { rowKey } from './replica'
import { TASK_COLUMN_GROUPS, WritesSchema } from './txn'

export type LocalIntent
  = | { kind: 'command', command: GtdCommand }
    | { kind: 'mutation', mutation: GtdMutation }
    | { kind: 'purge', taskId: string }

/** complete 重复任务时，后继 id 由规则 id 和次数决定，忽略调用方提议的值。 */
function withSuccessorId(command: GtdCommand, rows: EntityRow[]): GtdCommand {
  if (command.type !== 'complete')
    return command
  const task = rows.find(r => r.entity === 'task' && r.id === command.taskId && !r.deleted)
  if (task?.entity !== 'task')
    return command
  const { repeatRuleId, repeatRule } = task.data
  if (repeatRuleId == null || repeatRule == null)
    return command
  const nextTaskId = repeatSuccessorId(repeatRuleId, repeatRule.completedOccurrences + 1)
  return { ...command, clientGenerated: { nextTaskId } }
}

function changedColumns(entity: EntityRow['entity'], before: Record<string, unknown>, after: Record<string, unknown>): Record<string, unknown> {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  const changed = new Set([...keys].filter(k => !isEqual(before[k], after[k])))
  // updatedAt 是记账列：只有它变了不算修改，否则无变化的补丁也会产生事务
  if ([...changed].every(k => k === 'updatedAt'))
    return {}
  if (entity === 'task') {
    for (const group of TASK_COLUMN_GROUPS) {
      if (group.some(c => changed.has(c))) {
        for (const c of group)
          changed.add(c)
      }
    }
  }
  return Object.fromEntries([...changed].map(k => [k, after[k] ?? null]))
}

/** before 来自 materialize，只含存在的行；after 里软删的非 task 行整理成 remove。 */
function diffRows(before: EntityRow[], after: EntityRow[], purged: ReadonlySet<string>): Write[] {
  const beforeByKey = new Map(before.map(r => [rowKey(r.entity, r.id), r]))
  const writes: Write[] = []
  for (const row of after) {
    if (row.entity === 'task' && purged.has(row.id))
      continue
    const prev = beforeByKey.get(rowKey(row.entity, row.id))
    if (row.entity !== 'task' && row.deleted) {
      if (prev && !prev.deleted)
        writes.push({ op: 'remove', entity: row.entity, id: row.id })
      continue
    }
    const data = row.data as Record<string, unknown>
    if (!prev || prev.deleted) {
      writes.push({ op: 'create', entity: row.entity, id: row.id, data: { ...data } })
      continue
    }
    const columns = changedColumns(row.entity, prev.data as Record<string, unknown>, data)
    if (Object.keys(columns).length > 0)
      writes.push({ op: 'set', entity: row.entity, id: row.id, columns })
  }
  return writes
}

function assertPurgeable(rows: EntityRow[], taskId: string): void {
  const task = rows.find(r => r.entity === 'task' && r.id === taskId && !r.deleted)
  if (task?.entity !== 'task')
    throw taskNotFound()
  if (task.data.status !== EXPLICIT_STATUS.DELETED)
    throw new Error(`${taskLabel(task)}不在回收站中，不能永久删除；请从回收站里的上级任务操作`)
}

/**
 * 在 rows（本机当前界面状态）上依次执行 intents，返回这一条事务的写入。
 * 任一意图不合法时抛错；合法但无变化（例如重复完成）返回空数组，调用方不应入队。
 * 永久删除排在本次其他写入之后。
 */
export function emitWrites(rows: EntityRow[], intents: LocalIntent | readonly LocalIntent[], userId: string): Write[] {
  const list = Array.isArray(intents) ? intents as readonly LocalIntent[] : [intents as LocalIntent]
  const working = structuredClone(rows)
  const purged = new Set<string>()
  let counter = 0
  const nextSyncId = () => ++counter
  for (const intent of list) {
    if (intent.kind === 'purge') {
      assertPurgeable(working, intent.taskId)
      purged.add(intent.taskId)
    }
    else if (intent.kind === 'command') {
      applyCommand(withSuccessorId(intent.command, working), working, userId, nextSyncId)
    }
    else {
      applyMutation(intent.mutation, working, userId, nextSyncId)
    }
  }

  const writes: Write[] = [
    ...diffRows(rows, working, purged),
    ...[...purged].map(id => ({ op: 'purge', entity: 'task', id }) as const),
  ]
  if (writes.length > 0)
    WritesSchema.parse(writes)
  return writes
}
