/**
 * Op：领域写操作，也是 POST /gtd/apply 的请求体。
 * 构造器（createTask / moveTask / update / transitionOp / deleteOp / purgeOp）随 schema 集中于此；
 * 执行器（runXxx）在 state/（transition 例外，状态机语义在 command/transition.ts）。
 */
import type { EntityDataOf, GtdEntity, TaskUpsertPatch } from '../data/row-schema'
import type { StatusAction } from './transition'
import { z } from 'zod'
import {
  AttachmentRowDataSchema,
  EntityRowSchema,
  GtdEntitySchema,
  PerspectiveRowDataSchema,
  TaskRowDataSchema,
  TaskTagRowDataSchema,
  TaskUpsertPatchSchema,
} from '../data/row-schema'
import { STATUS_ACTIONS } from './transition'

const id = z.string().min(1)
const datetime = z.string().datetime()

export interface OpIds {
  newId: () => string
  nowIso: () => string
}

export const defaultOpIds: OpIds = {
  newId: () => crypto.randomUUID(),
  nowIso: () => new Date().toISOString(),
}

export function resolveOpIds(ids?: OpIds): OpIds {
  return ids ?? defaultOpIds
}

export function stamp(ids?: OpIds): { id: string, clientTs: string } {
  const resolved = resolveOpIds(ids)
  return { id: resolved.newId(), clientTs: resolved.nowIso() }
}

const stamped = { id, clientTs: datetime }

export const TransitionOpSchema = z.object({
  ...stamped,
  kind: z.literal('transition'),
  action: z.enum(STATUS_ACTIONS),
  taskId: id,
})

export const CreateOpSchema = z.object({
  ...stamped,
  kind: z.literal('create'),
  taskId: id,
  name: z.string().min(1),
  parentId: id.nullable(),
  order: TaskRowDataSchema.shape.order,
  mountDirId: id.nullable(),
})

export const MoveOpSchema = z.object({
  ...stamped,
  kind: z.literal('move'),
  taskId: id,
  parentId: id.nullable(),
  order: TaskRowDataSchema.shape.order,
})

export const PatchOpSchema = z.discriminatedUnion('entity', [
  z.object({
    ...stamped,
    kind: z.literal('patch'),
    entity: z.literal('task'),
    entityId: id,
    patch: TaskUpsertPatchSchema.default({}),
  }),
  z.object({
    ...stamped,
    kind: z.literal('patch'),
    entity: z.literal('task_tag'),
    entityId: id,
    patch: TaskTagRowDataSchema,
  }),
  z.object({
    ...stamped,
    kind: z.literal('patch'),
    entity: z.literal('perspective'),
    entityId: id,
    patch: PerspectiveRowDataSchema.partial().default({}),
  }),
  z.object({
    ...stamped,
    kind: z.literal('patch'),
    entity: z.literal('attachment'),
    entityId: id,
    patch: AttachmentRowDataSchema.partial().default({}),
  }),
])

export const DeleteOpSchema = z.object({
  ...stamped,
  kind: z.literal('delete'),
  entity: GtdEntitySchema,
  entityId: id,
})

export const PurgeOpSchema = z.object({
  kind: z.literal('purge'),
  taskId: id,
})

export const OpSchema = z.union([
  TransitionOpSchema,
  CreateOpSchema,
  MoveOpSchema,
  PatchOpSchema,
  DeleteOpSchema,
  PurgeOpSchema,
])

export type Op = z.infer<typeof OpSchema>

export const ApplyRequestSchema = z.object({
  ops: z.array(OpSchema).min(1),
})

export const GtdRowsResponseSchema = z.object({
  rows: z.array(EntityRowSchema),
})

export type ApplyRequest = z.infer<typeof ApplyRequestSchema>
export type GtdRowsResponse = z.infer<typeof GtdRowsResponseSchema>

/** 一条状态边上的操作。 */
export function transitionOp(action: StatusAction, taskId: string, ids?: OpIds): Op {
  const { id: opId, clientTs } = stamp(ids)
  return { kind: 'transition', id: opId, clientTs, action, taskId }
}

export function deleteOp(entity: GtdEntity, entityId: string, ids?: OpIds): Op {
  const { id: opId, clientTs } = stamp(ids)
  return { kind: 'delete', id: opId, clientTs, entity, entityId }
}

export function purgeOp(taskId: string): Op {
  return { kind: 'purge', taskId }
}

/** 新建任务点的输入（create Op 的业务字段）。 */
export interface CreateTaskInput {
  taskId: string
  name: string
  parentId: string | null
  order: number
  mountDirId: string | null
}

/** 建一个任务点，收成 create Op。 */
export function createTask(input: CreateTaskInput, ids?: OpIds): Op {
  const { id, clientTs } = stamp(ids)
  return { kind: 'create', id, clientTs, ...input }
}

/** 改父节点与同级序，收成 move Op。 */
export function moveTask(
  input: { taskId: string, parentId: string | null, order: number },
  ids?: OpIds,
): Op {
  const { id, clientTs } = stamp(ids)
  return { kind: 'move', id, clientTs, ...input }
}

/**
 * 改实体字段，收成 patch Op。按 entity 字面量收紧 patch 类型：
 * - task → TaskUpsertPatch（不含 status / parentId / statusChangedAt，分别走 transition / move）
 * - perspective / attachment → Partial 行 data
 * - task_tag → 完整行 data（关系行无 partial 语义）
 */
export function update(entity: 'task', entityId: string, patch: TaskUpsertPatch, ids?: OpIds): Op
export function update(entity: 'perspective', entityId: string, patch: Partial<EntityDataOf<'perspective'>>, ids?: OpIds): Op
export function update(entity: 'attachment', entityId: string, patch: Partial<EntityDataOf<'attachment'>>, ids?: OpIds): Op
export function update(entity: 'task_tag', entityId: string, patch: EntityDataOf<'task_tag'>, ids?: OpIds): Op
export function update(entity: GtdEntity, entityId: string, patch: Record<string, unknown>, ids?: OpIds): Op {
  const { id, clientTs } = stamp(ids)
  return { kind: 'patch', id, clientTs, entity, entityId, patch } as Op
}
