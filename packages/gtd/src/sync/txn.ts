/**
 * 事务重放的 wire 契约。
 *
 * 一条事务 = 一次本地操作在本机状态上已经算出的全部写入。各设备按服务器 seq 重放，
 * 同一列以后到的事务为准。服务器只校验结构，不做业务判断。
 * 设计说明见 wiki/GTD-事务重放.md。
 */
import type { SyncEntity } from '../data/sync-schema'
import { z } from 'zod'
import {
  AttachmentRowDataSchema,
  PerspectiveRowDataSchema,
  SyncEntitySchema,
  TaskRowDataSchema,
  TaskTagRowDataSchema,
} from '../data/sync-schema'

const id = z.string().min(1)
const columns = z.record(z.string(), z.unknown())

/**
 * task 上必须整组写入的列。组内列互相约束（例如终态时间戳只能有一个非空），
 * 只写其中一列会在与别的设备的写入交错后拼出非法组合。
 */
export const TASK_COLUMN_GROUPS: readonly (readonly string[])[] = [
  ['status', 'completedAt', 'heldAt', 'droppedAt'],
  ['plannedMode', 'plannedDate'],
  ['repeatRuleId', 'repeatRule'],
]

const ROW_DATA_SCHEMA = {
  task: TaskRowDataSchema,
  perspective: PerspectiveRowDataSchema,
  attachment: AttachmentRowDataSchema,
  task_tag: TaskTagRowDataSchema,
} as const satisfies Record<SyncEntity, z.ZodObject>

/** 新建一行：data 为完整行数据。目标已存在时，task 保持原样，其余实体整行覆盖。 */
export const CreateWriteSchema = z.object({
  op: z.literal('create'),
  entity: SyncEntitySchema,
  id,
  data: columns,
})

/** 改已有行的若干列。目标不存在时忽略。 */
export const SetWriteSchema = z.object({
  op: z.literal('set'),
  entity: SyncEntitySchema,
  id,
  columns,
})

/**
 * 删除一行非 task 实体（标签绑定、透视、附件）：行直接移出状态，不留软删行。
 * 之后要再出现只能靠新的 create；同时到达的对它的 set 被忽略。
 */
export const RemoveWriteSchema = z.object({
  op: z.literal('remove'),
  entity: z.enum(['task_tag', 'perspective', 'attachment']),
  id,
})

/** 永久删除任务及其当时的全部子孙，id 永不再生效。 */
export const PurgeWriteSchema = z.object({
  op: z.literal('purge'),
  entity: z.literal('task'),
  id,
})

export const WriteSchema = z.discriminatedUnion('op', [CreateWriteSchema, SetWriteSchema, RemoveWriteSchema, PurgeWriteSchema])

function checkWrite(write: Write, ctx: z.RefinementCtx, path: (string | number)[]): void {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message, path })
  if (write.op === 'purge' || write.op === 'remove')
    return
  const schema = ROW_DATA_SCHEMA[write.entity]
  if (write.op === 'create') {
    if (!schema.strict().safeParse(write.data).success)
      issue(`${write.entity} ${write.id}: create data 不是完整的行数据`)
    if (write.entity === 'task_tag') {
      const { taskId, tagId } = write.data as { taskId?: unknown, tagId?: unknown }
      if (write.id !== `${String(taskId)}|${String(tagId)}`)
        issue(`task_tag id 必须等于 taskId|tagId`)
    }
    return
  }
  const keys = Object.keys(write.columns)
  if (keys.length === 0)
    issue(`${write.entity} ${write.id}: set 没有任何改动`)
  if (!schema.partial().strict().safeParse(write.columns).success)
    issue(`${write.entity} ${write.id}: set 含非法列或非法值`)
  if (write.entity === 'task') {
    for (const group of TASK_COLUMN_GROUPS) {
      const present = group.filter(c => Object.hasOwn(write.columns, c))
      if (present.length > 0 && present.length < group.length)
        issue(`task ${write.id}: ${group.join('/')} 必须整组写入`)
    }
  }
  if (write.entity === 'task_tag' && keys.length > 0)
    issue(`task_tag 的 taskId/tagId 由 id 决定，不能修改`)
}

/** 一条事务的写入列表：非空，且每条都满足列与整组约束。 */
export const WritesSchema = z
  .array(WriteSchema)
  .min(1)
  .superRefine((writes, ctx) => {
    writes.forEach((w, i) => checkWrite(w, ctx, [i]))
  })

/** 未编号的事务：设备内 clientSeq 从 1 连续递增。 */
export const TransactionSchema = z.object({
  id,
  clientId: id,
  clientSeq: z.number().int().min(1),
  clientTs: z.string().datetime(),
  writes: WritesSchema,
})

/** 服务器编号后的事务：seq 每用户从 1 连续。 */
export const StoredTransactionSchema = TransactionSchema.extend({ seq: z.number().int().min(1) })

export type CreateWrite = z.infer<typeof CreateWriteSchema>
export type SetWrite = z.infer<typeof SetWriteSchema>
export type RemoveWrite = z.infer<typeof RemoveWriteSchema>
export type PurgeWrite = z.infer<typeof PurgeWriteSchema>
export type Write = z.infer<typeof WriteSchema>
export type Transaction = z.infer<typeof TransactionSchema>
export type StoredTransaction = z.infer<typeof StoredTransactionSchema>
