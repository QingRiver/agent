import type { Op, OpIds } from '../command/op'
import type { RepeatRule } from '../data/schema'
import type { GtdModel } from '../state/model'
import { resolveOpIds, update } from '../command/op'
import { REPEAT_ANCHOR } from '../data/types'
import { requireTask } from './shared'

export type RepeatRuleInput = Omit<RepeatRule, 'id' | 'completedOccurrences'>

export function planSetTaskRepeatOp(
  reader: GtdModel,
  taskId: string,
  input: RepeatRuleInput | null,
  ids?: OpIds,
): Op[] {
  const task = requireTask(reader, taskId)
  if (input?.anchor === REPEAT_ANCHOR.DUE && !task.data.dueDate)
    throw new Error('按截止日重复前，请先设置截止日期')
  if (input?.anchor === REPEAT_ANCHOR.DEFER && !task.data.deferDate)
    throw new Error('按推迟日重复前，请先设置推迟日期')
  const { newId, nowIso } = resolveOpIds(ids)
  const now = nowIso()
  if (!input) {
    return [update('task', taskId, { repeatRule: null, updatedAt: now }, ids)]
  }
  const existing = task.data.repeatRule
  const shared = existing
    ? reader.liveTasks().some(t => t.id !== taskId && t.data.repeatRule?.id === existing.id)
    : false
  const id = existing && !shared ? existing.id : newId()
  const rule: RepeatRule = {
    ...input,
    id,
    completedOccurrences: existing?.completedOccurrences ?? 0,
  }
  return [update('task', taskId, { repeatRule: rule, updatedAt: now }, ids)]
}
