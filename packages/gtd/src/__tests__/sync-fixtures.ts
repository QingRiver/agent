/**
 * sync 测试 util（复用领域 fixture，Object.assign 覆盖 JSON）。
 *
 * EntityRow.data 复用 `makeTask`/`makeProject`/... 构造，确保业务列符合 TaskSchema 等
 * （顺带验证 JSON 形状正确，可被 `serialize`/`parse` round-trip，见 sync.test.ts）。
 */

import type { RepeatRule, Task } from '../schema'
import type { SyncState } from '../sync'
import type {
  CompleteCommand,
  DeleteFolderCommand,
  DeleteProjectCommand,
  DeleteTagCommand,
  DropCommand,
  EntityRow,
  EntityRowOf,
  GtdCommand,
  GtdMutation,
  MoveCommand,
  SyncEntity,
  TaskDeleteMutation,
  TaskTagDeleteMutation,
  TaskTagUpsertMutation,
  TaskUpsertMutation,
} from '../sync-schema'
import {
  makeFolder,
  makeProject,
  makeTag,
  makeTask,
  NOW_ISO,
} from './fixtures'

export const SYNC_NOW = NOW_ISO

/** 通用 EntityRow：默认 task 行，Object.assign 覆盖。 */
export function makeRow(opts: Partial<EntityRow> = {}): EntityRow {
  const base = {
    entity: 'task',
    id: 'r1',
    userId: 'u1',
    syncId: 0,
    deleted: false,
    data: {} as EntityRow['data'],
  } as EntityRow
  return Object.assign(base, opts)
}

/**
 * task 行：data 用 TaskRowData（无 tagIds/attachmentIds——走 task_tag/attachment 行）；
 * repeatRule 内联（DB jsonb 视角）。
 */
export function makeTaskRow(
  id: string,
  dataOverrides: Partial<Task> & { repeatRule?: RepeatRule } = {},
  opts: Partial<Omit<EntityRow, 'entity' | 'id' | 'data'>> = {},
): EntityRowOf<'task'> {
  const { repeatRule, tagIds: _tg, attachmentIds: _at, ...taskOverrides } = dataOverrides
  const { id: _tid, tagIds: _t, attachmentIds: _a, ...taskFields } = makeTask({ id, ...taskOverrides })
  const data = (repeatRule != null ? { ...taskFields, repeatRule } : taskFields) as EntityRowOf<'task'>['data']
  return {
    entity: 'task',
    id,
    userId: opts.userId ?? 'u1',
    syncId: opts.syncId ?? 0,
    deleted: opts.deleted ?? false,
    data,
  }
}

/** project 行：data 复用 makeProject。 */
export function makeProjectRow(
  id: string,
  dataOverrides: Record<string, unknown> = {},
  opts: Partial<Omit<EntityRow, 'entity' | 'id' | 'data'>> = {},
): EntityRow {
  return makeRow({
    ...opts,
    entity: 'project',
    id,
    data: Object.assign(makeProject({ id }), dataOverrides),
  })
}

/** folder 行：data 复用 makeFolder。 */
export function makeFolderRow(
  id: string,
  dataOverrides: Record<string, unknown> = {},
  opts: Partial<Omit<EntityRow, 'entity' | 'id' | 'data'>> = {},
): EntityRow {
  return makeRow({
    ...opts,
    entity: 'folder',
    id,
    data: Object.assign(makeFolder({ id }), dataOverrides),
  })
}

/** tag 行：data 复用 makeTag。 */
export function makeTagRow(
  id: string,
  dataOverrides: Record<string, unknown> = {},
  opts: Partial<Omit<EntityRow, 'entity' | 'id' | 'data'>> = {},
): EntityRow {
  return makeRow({
    ...opts,
    entity: 'tag',
    id,
    data: Object.assign(makeTag({ id }), dataOverrides),
  })
}

/** task_tag 关联行：复合 id「taskId|tagId」。 */
export function makeTaskTagRow(
  taskId: string,
  tagId: string,
  opts: Partial<Omit<EntityRow, 'entity' | 'id' | 'data'>> = {},
): EntityRow {
  return makeRow({
    ...opts,
    entity: 'task_tag',
    id: `${taskId}|${tagId}`,
    data: { taskId, tagId },
  })
}

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
export function makeCommand(
  cmd: { id?: string, clientTs?: string, type: 'move', taskId: string, payload: MoveCommand['payload'] },
): MoveCommand
export function makeCommand(
  cmd: { id?: string, clientTs?: string, type: 'delete_folder', payload: { folderId: string } },
): DeleteFolderCommand
export function makeCommand(
  cmd: { id?: string, clientTs?: string, type: 'delete_project', payload: { projectId: string } },
): DeleteProjectCommand
export function makeCommand(
  cmd: { id?: string, clientTs?: string, type: 'delete_tag', payload: { tagId: string } },
): DeleteTagCommand
export function makeCommand(cmd: Partial<GtdCommand> & { id?: string, clientTs?: string }): GtdCommand
export function makeCommand(cmd: Partial<GtdCommand>): GtdCommand {
  const { id = 'c1', clientTs = SYNC_NOW, type = 'complete', ...rest } = cmd
  return { id, clientTs, type, ...rest } as GtdCommand
}

/** SyncState：clock 默认取 rows 最大 syncId。 */
export function makeState(
  rows: EntityRow[] = [],
  opts: { userId?: string, clock?: number, processedIds?: Set<string> } = {},
): SyncState {
  const maxSync = rows.reduce((m, r) => Math.max(m, r.syncId), 0)
  return {
    userId: opts.userId ?? 'u1',
    clock: opts.clock ?? maxSync,
    rows,
    processedIds: opts.processedIds ?? new Set<string>(),
  }
}

// ---------------- helpers ----------------

export function findRow(rows: EntityRow[], entity: SyncEntity, id: string): EntityRow | undefined {
  return rows.find(r => r.entity === entity && r.id === id)
}

export function field<T>(row: EntityRow | undefined, key: string): T | undefined {
  return row ? ((row.data as Record<string, unknown>)[key] as T | undefined) : undefined
}
