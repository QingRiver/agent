import { createContext } from 'react'

export const HideAssistantTextContext = createContext<((text: string) => boolean) | undefined>(undefined)
