/**
 * 行模型与意图（命令 / 字段补丁）的 Zod 契约。
 *
 * EntityRow 是领域读路径的行模型；服务端与客户端通过 applyIntents 在行上执行命令/补丁。
 */
import { z } from 'zod'
import {
  AttachmentSchema,
  PerspectiveSchema,
  RepeatRuleSchema,
  TaskSchema,
} from './schema'

/** id：DB text；不强制 UUID（task_tag 用复合「taskId|tagId」） */
const id = z.string().min(1)
const datetime = z.string().datetime()

// ---------------- 行 data（EntityRow.data；不含 envelope id） ----------------

/**
 * task 行 data：无 tagIds / attachmentIds（标签与附件走独立 task_tag / attachment 行）；
 * repeatRule 内联（与 DB repeat_rule jsonb 一致），repeatRuleId != null 时 repeatRule 应存在。
 * 含 mountDirId（权威挂载，LWW）。
 */
export const TaskRowDataSchema = TaskSchema
  .omit({ id: true })
  .extend({ repeatRule: RepeatRuleSchema.nullable().optional() })
/** perspective 行 data */
export const PerspectiveRowDataSchema = PerspectiveSchema.omit({ id: true })
/** attachment 行 data */
export const AttachmentRowDataSchema = AttachmentSchema.omit({ id: true })
/** task_tag 行 data；EntityRow.id 须等于 `${taskId}|${tagId}` */
export const TaskTagRowDataSchema = z.object({
  taskId: id,
  tagId: id,
})

// ---------------- EntityRow 信封（按 entity 判别） ----------------

const EntityRowBase = {
  userId: id,
  syncId: z.number().int().nonnegative(),
  deleted: z.boolean(),
}

export const TaskEntityRowSchema = z.object({
  ...EntityRowBase,
  entity: z.literal('task'),
  id,
  data: TaskRowDataSchema,
})
export const PerspectiveEntityRowSchema = z.object({
  ...EntityRowBase,
  entity: z.literal('perspective'),
  id,
  data: PerspectiveRowDataSchema,
})
export const AttachmentEntityRowSchema = z.object({
  ...EntityRowBase,
  entity: z.literal('attachment'),
  id,
  data: AttachmentRowDataSchema,
})
export const TaskTagEntityRowSchema = z
  .object({
    ...EntityRowBase,
    entity: z.literal('task_tag'),
    id: z.string().regex(/^[^|]+\|[^|]+$/),
    data: TaskTagRowDataSchema,
  })
  .refine(r => r.id === `${r.data.taskId}|${r.data.tagId}`, {
    message: 'task_tag EntityRow.id 必须等于 taskId|tagId',
  })

export const GtdEntitySchema = z.enum([
  'task',
  'perspective',
  'attachment',
  'task_tag',
])
export const EntityRowSchema = z.discriminatedUnion('entity', [
  TaskEntityRowSchema,
  PerspectiveEntityRowSchema,
  AttachmentEntityRowSchema,
  TaskTagEntityRowSchema,
])

// ---------------- Mutation（wire 入参） ----------------

const MutationBase = {
  id,
  entityId: id,
  clientTs: datetime,
}

/**
 * task upsert patch：无约束字段 LWW（title/note/order/dates/mountDirId/flagged 等）。
 * **status / parentId 不在 patch 范围**（2026-08-14 剥离）——状态语义操作走命令通道
 * （complete/drop/reopen/restore/delete/restore_from_trash/create_task/move_task），自带拉回。
 * 故 task upsert 不可建行（缺 status/parentId 必填字段），建行走 create_task 命令。
 * tagIds / attachmentIds 不在此处，由 task_tag / attachment 行表达。
 */
export const TaskUpsertPatchSchema = TaskRowDataSchema.partial().omit({ status: true, parentId: true })
export const TaskUpsertMutationSchema = z.object({
  ...MutationBase,
  entity: z.literal('task'),
  op: z.literal('upsert'),
  patch: TaskUpsertPatchSchema.optional(),
})
export const TaskDeleteMutationSchema = z.object({
  ...MutationBase,
  entity: z.literal('task'),
  op: z.literal('delete'),
})
export const TaskTagUpsertMutationSchema = z.object({
  ...MutationBase,
  entity: z.literal('task_tag'),
  op: z.literal('upsert'),
  patch: TaskTagRowDataSchema, // 必填
})
export const TaskTagDeleteMutationSchema = z.object({
  ...MutationBase,
  entity: z.literal('task_tag'),
  op: z.literal('delete'),
})
export const PerspectiveUpsertMutationSchema = z.object({
  ...MutationBase,
  entity: z.literal('perspective'),
  op: z.literal('upsert'),
  patch: PerspectiveRowDataSchema.partial().optional(),
})
export const PerspectiveDeleteMutationSchema = z.object({
  ...MutationBase,
  entity: z.literal('perspective'),
  op: z.literal('delete'),
})
export const AttachmentUpsertMutationSchema = z.object({
  ...MutationBase,
  entity: z.literal('attachment'),
  op: z.literal('upsert'),
  patch: AttachmentRowDataSchema.partial().optional(),
})
export const AttachmentDeleteMutationSchema = z.object({
  ...MutationBase,
  entity: z.literal('attachment'),
  op: z.literal('delete'),
})

export const GtdMutationSchema = z.union([
  TaskUpsertMutationSchema,
  TaskDeleteMutationSchema,
  TaskTagUpsertMutationSchema,
  TaskTagDeleteMutationSchema,
  PerspectiveUpsertMutationSchema,
  PerspectiveDeleteMutationSchema,
  AttachmentUpsertMutationSchema,
  AttachmentDeleteMutationSchema,
])

// ---------------- Command（wire 入参） ----------------

const CommandBase = { id, clientTs: datetime }

export const CompleteCommandSchema = z.object({
  ...CommandBase,
  type: z.literal('complete'),
  taskId: id,
  clientGenerated: z.object({ nextTaskId: id }).optional(),
})
export const DropCommandSchema = z.object({
  ...CommandBase,
  type: z.literal('drop'),
  taskId: id,
})
export const ReopenCommandSchema = z.object({
  ...CommandBase,
  type: z.literal('reopen'),
  taskId: id,
})
export const RestoreCommandSchema = z.object({
  ...CommandBase,
  type: z.literal('restore'),
  taskId: id,
})
export const DeleteTaskCommandSchema = z.object({
  ...CommandBase,
  type: z.literal('delete'),
  taskId: id,
})
/** 移出回收站：DELETED → ACTIVE（仅自身） */
export const RestoreFromTrashCommandSchema = z.object({
  ...CommandBase,
  type: z.literal('restore_from_trash'),
  taskId: id,
})
/**
 * 新建任务（命令通道）：带必需字段建行（status 默认 ACTIVE）+ 拉回已完成祖先。
 * 其余无约束字段（note/dates/flagged 等）后续 upsert patch 补。
 * taskId = 客户端提议的新 id；parentId/order/mountDirId 为位置必需字段。
 */
export const CreateTaskCommandSchema = z.object({
  ...CommandBase,
  type: z.literal('create_task'),
  taskId: id,
  name: z.string().min(1),
  parentId: id.nullable(),
  order: TaskRowDataSchema.shape.order,
  mountDirId: id.nullable(),
})
/**
 * 移动任务（命令通道）：改 parentId + order + 拉回已完成祖先（与 createTask 共用 planUpwardActivation）。
 * parentId 变更带动状态联动（活跃子挂已完成父 → 拉回），故走命令而非 LWW patch。
 */
export const MoveTaskCommandSchema = z.object({
  ...CommandBase,
  type: z.literal('move_task'),
  taskId: id,
  parentId: id.nullable(),
  order: TaskRowDataSchema.shape.order,
})

export const GtdCommandSchema = z.discriminatedUnion('type', [
  CompleteCommandSchema,
  DropCommandSchema,
  ReopenCommandSchema,
  RestoreCommandSchema,
  DeleteTaskCommandSchema,
  RestoreFromTrashCommandSchema,
  CreateTaskCommandSchema,
  MoveTaskCommandSchema,
])

// ---------------- 派生类型 ----------------

export type GtdEntity = z.infer<typeof GtdEntitySchema>
export type EntityRow = z.infer<typeof EntityRowSchema>
export type EntityRowOf<E extends GtdEntity> = Extract<EntityRow, { entity: E }>
export type EntityDataOf<E extends GtdEntity> = EntityRowOf<E>['data']

export type GtdMutation = z.infer<typeof GtdMutationSchema>
export type UpsertMutation = Extract<GtdMutation, { op: 'upsert' }>
export type DeleteMutation = Extract<GtdMutation, { op: 'delete' }>
export type TaskUpsertMutation = z.infer<typeof TaskUpsertMutationSchema>
export type TaskDeleteMutation = z.infer<typeof TaskDeleteMutationSchema>
export type TaskTagUpsertMutation = z.infer<typeof TaskTagUpsertMutationSchema>
export type TaskTagDeleteMutation = z.infer<typeof TaskTagDeleteMutationSchema>

export type GtdCommand = z.infer<typeof GtdCommandSchema>
export type CompleteCommand = z.infer<typeof CompleteCommandSchema>
export type DropCommand = z.infer<typeof DropCommandSchema>
export type ReopenCommand = z.infer<typeof ReopenCommandSchema>
export type RestoreCommand = z.infer<typeof RestoreCommandSchema>
export type DeleteTaskCommand = z.infer<typeof DeleteTaskCommandSchema>
export type RestoreFromTrashCommand = z.infer<typeof RestoreFromTrashCommandSchema>
export type CreateTaskCommand = z.infer<typeof CreateTaskCommandSchema>
export type MoveTaskCommand = z.infer<typeof MoveTaskCommandSchema>
