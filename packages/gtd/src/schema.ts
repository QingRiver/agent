export * from './data/row-schema'
export * from './data/schema'
export * from './data/types'

interface LegacyStamp {
  status: string
  statusChangedAt?: string | null
  completedAt?: string | null
  heldAt?: string | null
  droppedAt?: string | null
}

/**
 * 读入时把旧的 completedAt / heldAt / droppedAt 折成 statusChangedAt。
 * 写出只保留 statusChangedAt。
 */
export function foldStatusChangedAt<T extends LegacyStamp>(data: T): Omit<T, 'completedAt' | 'heldAt' | 'droppedAt'> & { statusChangedAt: string | null } {
  if (!('completedAt' in data) && !('heldAt' in data) && !('droppedAt' in data) && 'statusChangedAt' in data)
    return data as Omit<T, 'completedAt' | 'heldAt' | 'droppedAt'> & { statusChangedAt: string | null }
  let statusChangedAt = data.statusChangedAt ?? null
  if (statusChangedAt == null) {
    if (data.status === 'completed')
      statusChangedAt = data.completedAt ?? null
    else if (data.status === 'hold')
      statusChangedAt = data.heldAt ?? null
    else if (data.status === 'deleted')
      statusChangedAt = data.droppedAt ?? null
  }
  const { completedAt: _completedAt, heldAt: _heldAt, droppedAt: _droppedAt, ...rest } = data
  return { ...rest, statusChangedAt }
}
