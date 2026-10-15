import type { Context } from 'react'
import { createContext } from 'react'

export interface CardContextValue<T> {
  info: T
  isLoading: boolean
  error?: Error
  triggerAction: (actionName: string, payload?: unknown) => void
}

export const CardContext: Context<CardContextValue<unknown> | null> = createContext<CardContextValue<unknown> | null>(null)
