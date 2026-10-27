/**
 * 本地意图测试助手（mutation / command）。
 * 行级工厂见 factories.ts；事务构造见 txn.ts。
 */
import type { Task } from '../data/schema'
import type {
  CompleteCommand,
  DropCommand,
  EntityRow,
  GtdCommand,
  GtdMutation,
  SyncEntity,
  TaskDeleteMutation,
  TaskTagDeleteMutation,
  TaskTagUpsertMutation,
  TaskUpsertMutation,
} from '../data/sync-schema'
import { NOW_ISO } from './constants'

/** sync 测试里常用的「当前时刻」别名（= NOW_ISO）。 */
export const SYNC_NOW = NOW_ISO

/** mutation：按 entity×op 重载，返回具体 union 成员（默认 task upsert）。 */
export function makeMutation(
  cmd: { id?: string, clientTs?: string, entity?: 'task', op?: 'upsert', entityId: string, patch?: Partial<Task> },
): TaskUpsertMutation
export function makeMutation(
  cmd: { id?: string, clientTs?: string, entity?: 'task', op: 'delete', entityId: string },
): TaskDeleteMutation
export function makeMutation(
  cmd: { id?: string, clientTs?: string, entity: 'task_tag', op?: 'upsert', entityId: string, patch: { taskId: string, tagId: string } },
): TaskTagUpsertMutation
export function makeMutation(
  cmd: { id?: string, clientTs?: string, entity: 'task_tag', op: 'delete', entityId: string },
): TaskTagDeleteMutation
export function makeMutation(cmd: Partial<GtdMutation> & { entityId: string, id?: string, clientTs?: string }): GtdMutation
export function makeMutation(cmd: Partial<GtdMutation> & { entityId: string }): GtdMutation {
  const { id = 'm1', clientTs = SYNC_NOW, entity = 'task', op = 'upsert', ...rest } = cmd
  return { id, clientTs, entity, op, ...rest } as GtdMutation
}

/** command：按 type 重载，返回具体 union 成员（默认 complete）。 */
export function makeCommand(
  cmd: { id?: string, clientTs?: string, type?: 'complete', taskId: string, clientGenerated?: { nextTaskId: string } },
): CompleteCommand
export function makeCommand(cmd: { id?: string, clientTs?: string, type: 'drop', taskId: string }): DropCommand
export function makeCommand(cmd: Partial<GtdCommand> & { id?: string, clientTs?: string }): GtdCommand
export function makeCommand(cmd: Partial<GtdCommand>): GtdCommand {
  const { id = 'c1', clientTs = SYNC_NOW, type = 'complete', ...rest } = cmd
  return { id, clientTs, type, ...rest } as GtdCommand
}

export function findRow(rows: EntityRow[], entity: SyncEntity, id: string): EntityRow | undefined {
  return rows.find(r => r.entity === entity && r.id === id)
}

export function field<T>(row: EntityRow | undefined, key: string): T | undefined {
  return row ? ((row.data as Record<string, unknown>)[key] as T | undefined) : undefined
}
