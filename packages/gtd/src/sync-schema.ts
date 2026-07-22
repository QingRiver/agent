/**
 * 行级同步模型的 Zod 执行契约（wire 格式即落库格式）。
 *
 * EntityRow 贯通 Client / wire / Postgres（同形）；GtdDocument 仅导入导出边界。
 * 复用 ./schema 的实体子对象（FolderSchema/TaskSchema/RepeatRuleSchema 等，.omit 派生行 data）
 * 与 ./types 枚举（经 schema.ts 的 z.enum 派生）。
 */
import { z } from 'zod'
import {
  AttachmentSchema,
  FolderSchema,
  PerspectiveSchema,
  ProjectSchema,
  RepeatRuleSchema,
  TagSchema,
  TaskSchema,
} from './schema'

/** id：DB text；不强制 UUID（task_tag 用复合「taskId|tagId」） */
const id = z.string().min(1)
const datetime = z.string().datetime()
const fractionalOrder = z.number()

// ---------------- 行 data（EntityRow.data；不含 envelope id） ----------------

/** folder 行 data */
export const FolderRowDataSchema = FolderSchema.omit({ id: true })
/** tag 行 data */
export const TagRowDataSchema = TagSchema.omit({ id: true })
/** project 行 data */
export const ProjectRowDataSchema = ProjectSchema.omit({ id: true })
/**
 * task 行 data：无 tagIds / attachmentIds（标签与附件走独立 task_tag / attachment 行）；
 * repeatRule 内联（与 DB repeat_rule jsonb 一致），repeatRuleId != null 时 repeatRule 应存在。
 */
export const TaskRowDataSchema = TaskSchema
  .omit({ id: true, tagIds: true, attachmentIds: true })
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

export const FolderEntityRowSchema = z.object({
  ...EntityRowBase,
  entity: z.literal('folder'),
  id,
  data: FolderRowDataSchema,
})
export const TagEntityRowSchema = z.object({
  ...EntityRowBase,
  entity: z.literal('tag'),
  id,
  data: TagRowDataSchema,
})
export const ProjectEntityRowSchema = z.object({
  ...EntityRowBase,
  entity: z.literal('project'),
  id,
  data: ProjectRowDataSchema,
})
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

export const SyncEntitySchema = z.enum([
  'task',
  'project',
  'folder',
  'tag',
  'perspective',
  'attachment',
  'task_tag',
])
export const EntityRowSchema = z.discriminatedUnion('entity', [
  FolderEntityRowSchema,
  TagEntityRowSchema,
  ProjectEntityRowSchema,
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

/** upsert.patch = 对应行 data 的 Partial；tagIds / attachmentIds 不在此处，由 task_tag / attachment 行表达 */
export const TaskUpsertMutationSchema = z.object({
  ...MutationBase,
  entity: z.literal('task'),
  op: z.literal('upsert'),
  patch: TaskRowDataSchema.partial().optional(),
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
export const ProjectUpsertMutationSchema = z.object({
  ...MutationBase,
  entity: z.literal('project'),
  op: z.literal('upsert'),
  patch: ProjectRowDataSchema.partial().optional(),
})
export const ProjectDeleteMutationSchema = z.object({
  ...MutationBase,
  entity: z.literal('project'),
  op: z.literal('delete'),
})
export const FolderUpsertMutationSchema = z.object({
  ...MutationBase,
  entity: z.literal('folder'),
  op: z.literal('upsert'),
  patch: FolderRowDataSchema.partial().optional(),
})
export const FolderDeleteMutationSchema = z.object({
  ...MutationBase,
  entity: z.literal('folder'),
  op: z.literal('delete'),
})
export const TagUpsertMutationSchema = z.object({
  ...MutationBase,
  entity: z.literal('tag'),
  op: z.literal('upsert'),
  patch: TagRowDataSchema.partial().optional(),
})
export const TagDeleteMutationSchema = z.object({
  ...MutationBase,
  entity: z.literal('tag'),
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
  ProjectUpsertMutationSchema,
  ProjectDeleteMutationSchema,
  FolderUpsertMutationSchema,
  FolderDeleteMutationSchema,
  TagUpsertMutationSchema,
  TagDeleteMutationSchema,
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
export const MoveCommandSchema = z.object({
  ...CommandBase,
  type: z.literal('move'),
  taskId: id,
  /** 目标位置全必填，消灭 optional+nullable 双态；null = Inbox / 顶层（有效语义值） */
  payload: z.object({
    projectId: id.nullable(),
    parentId: id.nullable(),
    order: fractionalOrder,
  }),
})
export const DeleteFolderCommandSchema = z.object({
  ...CommandBase,
  type: z.literal('delete_folder'),
  payload: z.object({ folderId: id }),
})
export const DeleteProjectCommandSchema = z.object({
  ...CommandBase,
  type: z.literal('delete_project'),
  payload: z.object({ projectId: id }),
})
export const DeleteTagCommandSchema = z.object({
  ...CommandBase,
  type: z.literal('delete_tag'),
  payload: z.object({ tagId: id }),
})

export const GtdCommandSchema = z.discriminatedUnion('type', [
  CompleteCommandSchema,
  DropCommandSchema,
  MoveCommandSchema,
  DeleteFolderCommandSchema,
  DeleteProjectCommandSchema,
  DeleteTagCommandSchema,
])

// ---------------- push / pull ----------------

export const PushRequestSchema = z.object({
  mutations: z.array(GtdMutationSchema),
  commands: z.array(GtdCommandSchema),
  lastSyncId: z.number().int().nonnegative(),
})
export const PullRequestSchema = z.object({
  lastSyncId: z.number().int().nonnegative(),
})
export const PushResponseSchema = z.object({
  applied: z.array(id),
  rejected: z.array(z.object({ id, reason: z.string() })),
  changes: z.array(EntityRowSchema),
  serverSyncId: z.number().int().nonnegative(),
})
export const PullResponseSchema = z.object({
  changes: z.array(EntityRowSchema),
  serverSyncId: z.number().int().nonnegative(),
})

// ---------------- 派生类型 ----------------

export type SyncEntity = z.infer<typeof SyncEntitySchema>
export type EntityRow = z.infer<typeof EntityRowSchema>
export type EntityRowOf<E extends SyncEntity> = Extract<EntityRow, { entity: E }>
export type EntityDataOf<E extends SyncEntity> = EntityRowOf<E>['data']

export type FolderEntityRow = z.infer<typeof FolderEntityRowSchema>
export type TagEntityRow = z.infer<typeof TagEntityRowSchema>
export type ProjectEntityRow = z.infer<typeof ProjectEntityRowSchema>
export type TaskEntityRow = z.infer<typeof TaskEntityRowSchema>
export type PerspectiveEntityRow = z.infer<typeof PerspectiveEntityRowSchema>
export type AttachmentEntityRow = z.infer<typeof AttachmentEntityRowSchema>
export type TaskTagEntityRow = z.infer<typeof TaskTagEntityRowSchema>

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
export type MoveCommand = z.infer<typeof MoveCommandSchema>
export type DeleteFolderCommand = z.infer<typeof DeleteFolderCommandSchema>
export type DeleteProjectCommand = z.infer<typeof DeleteProjectCommandSchema>
export type DeleteTagCommand = z.infer<typeof DeleteTagCommandSchema>

export type PushRequest = z.infer<typeof PushRequestSchema>
export type PullRequest = z.infer<typeof PullRequestSchema>
export type PushResponse = z.infer<typeof PushResponseSchema>
export type PullResponse = z.infer<typeof PullResponseSchema>
