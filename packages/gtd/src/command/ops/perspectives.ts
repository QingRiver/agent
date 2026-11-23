import type { GtdIntent } from '../../apply/apply'
import type { GtdReader } from '../../data/reader'
import type { PerspectiveResolutionContext } from '../../view/filter'
import type { PerspectiveInput } from '../../view/perspective-input'
import type { IntentIds } from './ids'
import { validatePerspectiveInput } from '../../view/perspective-input'
import { deleteIntent, upsertIntent } from './builders'
import { resolveIds } from './ids'

export function planAddPerspectiveOp(
  input: PerspectiveInput,
  context: PerspectiveResolutionContext,
  ids?: IntentIds,
): GtdIntent[] {
  const result = validatePerspectiveInput(input, context, { mode: 'persist' })
  if (!result.ok)
    throw new Error(result.errors.map(error => error.message).join('; '))
  const { newId, nowIso } = resolveIds(ids)
  const now = nowIso()
  const id = newId()
  return [upsertIntent('perspective', id, {
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
  reader: GtdReader,
  id: string,
  input: PerspectiveInput,
  context: PerspectiveResolutionContext,
  ids?: IntentIds,
): GtdIntent[] {
  if (!reader.livePerspectives().some(p => p.id === id))
    throw new Error('自定义透视不存在')
  const result = validatePerspectiveInput(input, context, { mode: 'persist', perspectiveId: id })
  if (!result.ok)
    throw new Error(result.errors.map(error => error.message).join('; '))
  const { nowIso } = resolveIds(ids)
  return [upsertIntent('perspective', id, {
    name: result.value.name!,
    icon: result.value.icon ?? null,
    filter: result.value.filter,
    groupBy: result.value.groupBy,
    sortBy: result.value.sortBy,
    updatedAt: nowIso(),
  }, ids)]
}

export function planRemovePerspectiveOp(id: string, ids?: IntentIds): GtdIntent[] {
  return [deleteIntent('perspective', id, ids)]
}
