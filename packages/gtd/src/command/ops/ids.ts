export interface IntentIds {
  newId: () => string
  nowIso: () => string
}

export const defaultIntentIds: IntentIds = {
  newId: () => crypto.randomUUID(),
  nowIso: () => new Date().toISOString(),
}

export function resolveIds(ids?: IntentIds): IntentIds {
  return ids ?? defaultIntentIds
}
