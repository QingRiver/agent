import type { CardContextValue } from './card-context'
import { use } from 'react'
import { CardContext } from './card-context'

export function useCardContext<T>(): CardContextValue<T> {
  const value = use(CardContext)
  if (!value)
    throw new Error('useCardContext 必须在 CodeCard 内使用')
  return value as CardContextValue<T>
}
