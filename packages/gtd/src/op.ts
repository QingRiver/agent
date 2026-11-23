/**
 * Op：领域写操作，也是 POST /gtd/apply 的请求体。
 */
import type { GtdEntity } from './data/row-schema'
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
} from './data/row-schema'
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
