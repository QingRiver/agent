import type { Op, OpIds } from '../op'
import type { GtdModel } from '../state/model'
import type { PerspectiveResolutionContext } from '../view/filter'
import type { PerspectiveInput } from '../view/perspective-input'
import { deleteOp, resolveOpIds } from '../op'
import { update } from '../state/update'
import { validatePerspectiveInput } from '../view/perspective-input'

export function planAddPerspectiveOp(
  input: PerspectiveInput,
  context: PerspectiveResolutionContext,
  ids?: OpIds,
): Op[] {
  const result = validatePerspectiveInput(input, context, { mode: 'persist' })
  if (!result.ok)
    throw new Error(result.errors.map(error => error.message).join('; '))
  const { newId, nowIso } = resolveOpIds(ids)
  const now = nowIso()
  const id = newId()
  return [update('perspective', id, {
    name: result.value.name!,
    icon: result.value.icon ?? null,
    filter: result.value.filter,
    groupBy: result.value.groupBy,
    sortBy: result.value.sortBy,
    createdAt: now,
    updatedAt: null,
  }, ids)]
}

export function planPatchPerspectiveOp(
  reader: GtdModel,
  id: string,
  input: PerspectiveInput,
  context: PerspectiveResolutionContext,
  ids?: OpIds,
): Op[] {
  if (!reader.livePerspectives().some(p => p.id === id))
    throw new Error('自定义透视不存在')
  const result = validatePerspectiveInput(input, context, { mode: 'persist', perspectiveId: id })
  if (!result.ok)
    throw new Error(result.errors.map(error => error.message).join('; '))
  const { nowIso } = resolveOpIds(ids)
  return [update('perspective', id, {
    name: result.value.name!,
    icon: result.value.icon ?? null,
    filter: result.value.filter,
    groupBy: result.value.groupBy,
    sortBy: result.value.sortBy,
    updatedAt: nowIso(),
  }, ids)]
}

export function planRemovePerspectiveOp(id: string, ids?: OpIds): Op[] {
  return [deleteOp('perspective', id, ids)]
}
