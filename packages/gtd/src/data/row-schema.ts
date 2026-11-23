/**
 * 行模型的 Zod 契约。字段补丁约束也在这里；Op 本身见 op.ts。
 *
 * EntityRow 是领域读路径的行模型；写入走 Op（见 op.ts）。
 */
import { z } from 'zod'
import {
  AttachmentSchema,
  PerspectiveSchema,
  RepeatRuleSchema,
  TaskSchema,
} from './schema'
import { EXPLICIT_STATUS } from './types'

/** id：DB text；不强制 UUID（task_tag 用复合「taskId|tagId」） */
const id = z.string().min(1)

// ---------------- 行 data（EntityRow.data；不含 envelope id） ----------------

/**
 * task 行 data：无 tagIds / attachmentIds（标签与附件走独立 task_tag / attachment 行）；
 * repeatRule 内联（与 DB repeat_rule jsonb 一致），repeatRuleId != null 时 repeatRule 应存在。
 * 含 mountDirId（权威挂载，LWW）。
 */
export const TaskRowDataSchema = TaskSchema
  .omit({ id: true })
  .extend({ repeatRule: RepeatRuleSchema.nullable().optional() })

const taskDataFields = TaskRowDataSchema.shape

/** 新建任务时由调用方给出的字段；其余走 schema 默认值。 */
const CREATE_TASK_INPUT = ['name', 'mountDirId', 'parentId', 'order', 'createdAt', 'updatedAt'] as const

const CREATE_TASK_DEFAULTS = {
  note: null,
  status: EXPLICIT_STATUS.ACTIVE,
  groupType: null,
  deferDate: null,
  dueDate: null,
  statusChangedAt: null,
  flagged: false,
  estimateMinutes: null,
  repeatRuleId: null,
  repeatedFromTaskId: null,
  repeatRule: null,
} as const

function taskDataField(key: keyof typeof taskDataFields): z.ZodType {
  const field = taskDataFields[key]
  if ((CREATE_TASK_INPUT as readonly string[]).includes(key) || field instanceof z.ZodDefault)
    return field
  const defaults: Partial<Record<keyof typeof taskDataFields, unknown>> = CREATE_TASK_DEFAULTS
  if (Object.hasOwn(defaults, key))
    return (field as z.ZodType & { default: (value: unknown) => z.ZodType }).default(defaults[key])
  throw new Error(`新建任务缺少字段 ${key} 的默认值`)
}

/** 新建任务的 data：必填字段原样校验，其余用上面的默认值补齐。 */
export const CreateTaskDataSchema = z.object(
  Object.fromEntries(
    (Object.keys(taskDataFields) as (keyof typeof taskDataFields)[])
      .map(key => [key, taskDataField(key)]),
  ) as { [K in keyof typeof taskDataFields]: z.ZodType },
)

export function createTaskData(
  input: Pick<EntityDataOf<'task'>, typeof CREATE_TASK_INPUT[number]>,
): EntityDataOf<'task'> {
  return CreateTaskDataSchema.parse(input) as EntityDataOf<'task'>
}
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

/**
 * 任务字段补丁：无约束字段 LWW。
 * status / parentId / statusChangedAt 不在补丁范围，分别走 transition 与 move。
 * 建行走 create。标签与附件走 task_tag / attachment 行。
 */
export const TaskUpsertPatchSchema = TaskRowDataSchema.partial().omit({
  status: true,
  parentId: true,
  statusChangedAt: true,
})

// ---------------- 派生类型 ----------------

export type GtdEntity = z.infer<typeof GtdEntitySchema>
export type EntityRow = z.infer<typeof EntityRowSchema>
export type EntityRowOf<E extends GtdEntity> = Extract<EntityRow, { entity: E }>
export type EntityDataOf<E extends GtdEntity> = EntityRowOf<E>['data']
