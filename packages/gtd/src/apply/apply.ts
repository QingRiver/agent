/**
 * 在当前行上执行用户意图，返回新的行集合（服务端与客户端乐观预览共用）。
 */
import type { EntityRow, GtdCommand, GtdMutation } from '../data/row-schema'
import { z } from 'zod'
import { taskLabel, taskNotFound } from '../command/errors'
import { repeatSuccessorId } from '../command/repeat'
import { EntityRowSchema, GtdCommandSchema, GtdMutationSchema } from '../data/row-schema'
import { findLive, taskTree } from '../data/rows'
import { EXPLICIT_STATUS } from '../data/types'
import { subtree } from '../structure/tree'
import { applyCommand, applyMutation } from './intent'

export type GtdIntent
  = | { kind: 'command', command: GtdCommand }
    | { kind: 'mutation', mutation: GtdMutation }
    | { kind: 'purge', taskId: string }

export const GtdIntentSchema: z.ZodType<GtdIntent> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('command'), command: GtdCommandSchema }),
  z.object({ kind: z.literal('mutation'), mutation: GtdMutationSchema }),
  z.object({ kind: z.literal('purge'), taskId: z.string().min(1) }),
])

export const ApplyRequestSchema = z.object({
  intents: z.array(GtdIntentSchema).min(1),
})

export const GtdRowsResponseSchema = z.object({
  rows: z.array(EntityRowSchema),
})

export type ApplyRequest = z.infer<typeof ApplyRequestSchema>
export type GtdRowsResponse = z.infer<typeof GtdRowsResponseSchema>

/** complete 重复任务时，后继 id 由规则 id 和次数决定，忽略调用方提议的值。 */
function withSuccessorId(command: GtdCommand, rows: EntityRow[]): GtdCommand {
  if (command.type !== 'complete')
    return command
  const task = findLive(rows, 'task', command.taskId)
  if (!task)
    return command
  const { repeatRuleId, repeatRule } = task.data
  if (repeatRuleId == null || repeatRule == null)
    return command
  const nextTaskId = repeatSuccessorId(repeatRuleId, repeatRule.completedOccurrences + 1)
  return { ...command, clientGenerated: { nextTaskId } }
}

function assertPurgeable(rows: EntityRow[], taskId: string): void {
  const task = findLive(rows, 'task', taskId)
  if (!task)
    throw taskNotFound()
  if (task.data.status !== EXPLICIT_STATUS.DELETED)
    throw new Error(`${taskLabel(task)}不在回收站中，不能永久删除；请从回收站里的上级任务操作`)
}

function maxSyncId(rows: EntityRow[]): number {
  let max = 0
  for (const r of rows) {
    if (r.syncId > max)
      max = r.syncId
  }
  return max
}

/** 永久删除任务及其子孙，以及挂在它们上面的 task_tag / attachment。 */
function purgeTaskTree(rows: EntityRow[], taskId: string): void {
  const tree = taskTree(rows)
  if (!tree.byId.has(taskId))
    throw taskNotFound()
  const purged = new Set([taskId, ...subtree(tree, taskId).map(t => t.id)])
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]!
    if (row.entity === 'task' && purged.has(row.id)) {
      rows.splice(i, 1)
      continue
    }
    if ((row.entity === 'task_tag' || row.entity === 'attachment') && purged.has(row.data.taskId))
      rows.splice(i, 1)
  }
}

/**
 * 在 rows 上依次执行 intents，返回新行（已去掉软删的非 task 行）。
 * 任一意图不合法时抛错。无变化时仍返回与输入等价的新数组。
 */
export function applyIntents(
  rows: EntityRow[],
  intents: GtdIntent | readonly GtdIntent[],
  userId: string,
  nextSyncId?: () => number,
): EntityRow[] {
  const list = Array.isArray(intents) ? intents as readonly GtdIntent[] : [intents as GtdIntent]
  const working = structuredClone(rows)
  let counter = maxSyncId(working)
  const next = nextSyncId ?? (() => ++counter)

  for (const intent of list) {
    if (intent.kind === 'purge') {
      assertPurgeable(working, intent.taskId)
      purgeTaskTree(working, intent.taskId)
    }
    else if (intent.kind === 'command') {
      applyCommand(withSuccessorId(intent.command, working), working, userId, next)
    }
    else {
      applyMutation(intent.mutation, working, userId, next)
    }
  }

  return working.filter(r => r.entity === 'task' || !r.deleted)
}
