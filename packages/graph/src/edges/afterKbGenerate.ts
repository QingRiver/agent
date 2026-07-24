import type { KbStateType } from '../state/kbState'
import { MAX_CITATION_RETRIES } from '../state/kbState'

/** citation 未过且可重试 → generate，否则 END */
export function afterKbGenerate(state: KbStateType): 'generate' | '__end__' {
  const last = state.messages.at(-1)
  if (last?.getType() === 'human' && state.citationRetries > 0 && state.citationRetries <= MAX_CITATION_RETRIES)
    return 'generate'
  return '__end__'
}
