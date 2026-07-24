import type { KbStateType } from '../state/kbState'

/** routeRejected → END，否则 generate */
export function afterKbRetrieve(state: KbStateType): 'generate' | '__end__' {
  if (state.routeRejected)
    return '__end__'
  return 'generate'
}
