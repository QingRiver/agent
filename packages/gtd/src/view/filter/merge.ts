import type { FilterNode } from './schema'
import { FILTER_FIELD } from '../../data/types'
import { LEAF_OP, LOGIC_OP } from './schema'

export const ENTITY_FOCUS_FIELDS = [FILTER_FIELD.PROJECT, FILTER_FIELD.TAG] as const

/** 可焦点的实体列 = 任务直接绑定、可 some 过滤的 field */
export type EntityFocusKind = (typeof ENTITY_FOCUS_FIELDS)[number]

export interface EntityFocus { field: EntityFocusKind, id: string }

/** AND 合并两棵过滤树；任一侧 null → 另一侧；双侧 and 则摊平一层 */
export function mergeFilter(a: FilterNode | null, b: FilterNode | null): FilterNode | null {
  if (a == null)
    return b
  if (b == null)
    return a
  const left = a.op === LOGIC_OP.AND ? a.children : [a]
  const right = b.op === LOGIC_OP.AND ? b.children : [b]
  return { op: LOGIC_OP.AND, children: [...left, ...right] }
}

/** 从实体焦点构造 some 叶：field 即 FILTER_FIELD.PROJECT | TAG */
export function entityFocusFilter(focus: EntityFocus): FilterNode {
  return { op: LEAF_OP.SOME, field: focus.field, value: [focus.id] }
}
