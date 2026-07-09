import type { RefObject } from 'react'
import type { TextEditorSession, WriterAgent } from './TextEditorSession'
import type { Suggestion } from './types'
import { useAgent } from '@copilotkit/react-core/v2'
import { useEffect, useRef, useState } from 'react'
import { TextEditorSession as Session } from './TextEditorSession'

export interface UseTextEditorResult {
  mountRef: RefObject<HTMLDivElement | null>
  polishing: boolean
  suggestions: Suggestion[]
  thinking: string
  polish: () => void
  accept: (sid: string) => void
  reject: (sid: string) => void
}

export function useTextEditor(): UseTextEditorResult {
  const { agent } = useAgent({ agentId: 'writer' })
  const mountRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<TextEditorSession | null>(null)
  const agentRef = useRef(agent)
  agentRef.current = agent

  const [polishing, setPolishing] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [thinking, setThinking] = useState('')

  useEffect(() => {
    const mount = mountRef.current
    if (mount == null)
      return

    const session = new Session({
      mount,
      getAgent: () => agentRef.current as unknown as WriterAgent | undefined,
      onSuggestionsChange: setSuggestions,
      onPolishingChange: setPolishing,
      onThinkingChange: setThinking,
    })
    session.start()
    sessionRef.current = session

    return () => {
      session.dispose()
      sessionRef.current = null
    }
  }, [])

  return {
    mountRef,
    polishing,
    suggestions,
    thinking,
    polish: () => { void sessionRef.current?.polish() },
    accept: sid => sessionRef.current?.accept(sid),
    reject: sid => sessionRef.current?.reject(sid),
  }
}
