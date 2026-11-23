import type { GtdIntent } from '../../apply/apply'
import type { GtdCommand, GtdEntity, GtdMutation } from '../../data/row-schema'
import type { IntentIds } from './ids'
import { resolveIds } from './ids'

export function commandIntent(
  fields: Record<string, unknown>,
  ids?: IntentIds,
): GtdIntent {
  const { newId, nowIso } = resolveIds(ids)
  return {
    kind: 'command',
    command: { ...fields, id: newId(), clientTs: nowIso() } as GtdCommand,
  }
}

export function upsertIntent(
  entity: GtdEntity,
  entityId: string,
  patch: Record<string, unknown>,
  ids?: IntentIds,
): GtdIntent {
  const { newId, nowIso } = resolveIds(ids)
  return {
    kind: 'mutation',
    mutation: {
      id: newId(),
      entity,
      entityId,
      op: 'upsert',
      patch,
      clientTs: nowIso(),
    } as GtdMutation,
  }
}

export function deleteIntent(
  entity: GtdEntity,
  entityId: string,
  ids?: IntentIds,
): GtdIntent {
  const { newId, nowIso } = resolveIds(ids)
  return {
    kind: 'mutation',
    mutation: {
      id: newId(),
      entity,
      entityId,
      op: 'delete',
      clientTs: nowIso(),
    } as GtdMutation,
  }
}

export function purgeIntent(taskId: string): GtdIntent {
  return { kind: 'purge', taskId }
}
