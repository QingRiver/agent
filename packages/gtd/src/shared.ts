import type { GtdCommand, GtdMutation } from './sync-schema'

export function isMutation(item: GtdMutation | GtdCommand): item is GtdMutation {
  return 'op' in item
}
