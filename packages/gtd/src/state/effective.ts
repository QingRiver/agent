/**
 * 读侧字段继承：沿祖先链计算有效 defer / due / planned / status / 挂载。
 *
 * 只依赖树拓扑（`./tree`）与行数据，不依赖 GtdModel，归「读侧派生」。
 * 写侧的级联传播见 `./propagate`。
 */
import type { EntityRowOf } from '../data/row-schema'
import type { ExplicitStatusValue } from '../data/types'
import type { TaskTree } from './tree'
import { EXPLICIT_STATUS, PLANNED_MODE } from '../data/types'
import { ancestors } from './tree'

type Iso = string | null
type PlannedMode = (typeof PLANNED_MODE)[keyof typeof PLANNED_MODE]

function minIso(a: Iso, b: Iso): Iso {
  if (a == null)
    return b
  if (b == null)
    return a
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b
}

function maxIso(a: Iso, b: Iso): Iso {
  if (a == null)
    return b
  if (b == null)
    return a
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b
}

function hasOwnPlanned(task: EntityRowOf<'task'>): boolean {
  const mode = task.data.plannedMode ?? PLANNED_MODE.NONE
  return mode !== PLANNED_MODE.NONE
}

/** effective 截止日：沿祖先链取最早 dueDate，null 视为无约束。 */
export function effectiveDue(task: EntityRowOf<'task'>, tree: TaskTree): Iso {
  let acc: Iso = task.data.dueDate
  for (const anc of ancestors(tree, task.id))
    acc = minIso(acc, anc.data.dueDate)
  return acc
}

/** effective 推迟日：沿链取最晚 deferDate，再钳到 effectiveDue。全链无 defer 则保持 null。 */
export function effectiveDefer(task: EntityRowOf<'task'>, tree: TaskTree): Iso {
  let acc: Iso = task.data.deferDate
  for (const anc of ancestors(tree, task.id))
    acc = maxIso(acc, anc.data.deferDate)
  if (acc == null)
    return null
  return minIso(acc, effectiveDue(task, tree))
}

export function effectivePlannedMode(task: EntityRowOf<'task'>, tree: TaskTree): PlannedMode {
  if (hasOwnPlanned(task))
    return task.data.plannedMode ?? PLANNED_MODE.NONE
  for (const anc of ancestors(tree, task.id)) {
    if (hasOwnPlanned(anc))
      return anc.data.plannedMode ?? PLANNED_MODE.NONE
  }
  return PLANNED_MODE.NONE
}

export function effectivePlannedDate(task: EntityRowOf<'task'>, tree: TaskTree): Iso {
  const selfMode = task.data.plannedMode ?? PLANNED_MODE.NONE
  if (selfMode === PLANNED_MODE.ON)
    return task.data.plannedDate
  if (selfMode === PLANNED_MODE.ROLLING)
    return null
  for (const anc of ancestors(tree, task.id)) {
    const mode = anc.data.plannedMode ?? PLANNED_MODE.NONE
    if (mode === PLANNED_MODE.ON)
      return anc.data.plannedDate
    if (mode === PLANNED_MODE.ROLLING)
      return null
  }
  return null
}

/** 有效挂载：只看根任务的 mountDirId。目录无效时视为 Inbox。 */
export function effectiveMountDirId(
  task: EntityRowOf<'task'>,
  tree: TaskTree,
  isMountValid: (dirId: string) => boolean = () => true,
): string | null {
  const chain = ancestors(tree, task.id)
  const root = chain.at(-1) ?? task
  const mount = root.data.mountDirId ?? null
  return mount != null && isMountValid(mount) ? mount : null
}

/**
 * 有效状态：删除沿链优先；否则从根往下，第一个搁置或完成决定有效状态。
 */
export function effectiveStatus(task: EntityRowOf<'task'>, tree: TaskTree): ExplicitStatusValue {
  if (task.data.status === EXPLICIT_STATUS.DELETED)
    return EXPLICIT_STATUS.DELETED
  for (const anc of ancestors(tree, task.id)) {
    if (anc.data.status === EXPLICIT_STATUS.DELETED)
      return EXPLICIT_STATUS.DELETED
  }
  const path = [...ancestors(tree, task.id)].reverse()
  path.push(task)
  for (const node of path) {
    if (node.data.status === EXPLICIT_STATUS.HOLD || node.data.status === EXPLICIT_STATUS.COMPLETED)
      return node.data.status
  }
  return EXPLICIT_STATUS.ACTIVE
}
