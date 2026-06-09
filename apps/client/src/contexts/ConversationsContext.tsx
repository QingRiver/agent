import type { AgentId, AgUiMessage, ThreadState } from '@server/shared/conversation'
import type { ReactNode } from 'react'
import type { UseConversationsResult } from './conversations-types'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { DEFAULT_AGUI_AGENT_ID } from '../lib/aguiAgents'
import {
  createConversation,
  deleteConversation,
  getConversationMessages,
  listConversations,
  pinConversation,
  unpinConversation,
} from '../lib/conversation-api'
import { ConversationsContext } from './conversations-context'

export function ConversationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const userId = user?.id

  const [conversations, setConversations] = useState<UseConversationsResult['conversations']>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeMessages, setActiveMessages] = useState<AgUiMessage[] | null>(null)
  const [threadState, setThreadState] = useState<ThreadState | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!userId)
      return
    setIsLoading(true)
    setError(null)
    try {
      let list = await listConversations()
      if (list.length === 0) {
        const created = await createConversation(DEFAULT_AGUI_AGENT_ID)
        list = [created]
      }
      setConversations(list)
      setActiveId((prev) => {
        if (prev && list.some(c => c.id === prev))
          return prev
        return list[0]?.id ?? null
      })
    }
    catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    finally {
      setIsLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (!userId) {
      setConversations([])
      setActiveId(null)
      setActiveMessages(null)
      setThreadState(null)
      setError(null)
      setIsLoading(false)
      setMessagesLoading(false)
      return
    }

    let cancelled = false
    setIsLoading(true)
    setError(null)

    void (async () => {
      try {
        let list = await listConversations()
        if (list.length === 0) {
          const created = await createConversation(DEFAULT_AGUI_AGENT_ID)
          list = [created]
        }
        if (cancelled)
          return
        setConversations(list)
        setActiveId((prev) => {
          if (prev && list.some(c => c.id === prev))
            return prev
          return list[0]?.id ?? null
        })
      }
      catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : String(e))
      }
      finally {
        if (!cancelled)
          setIsLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [userId])

  const loadActiveThread = useCallback(async (threadId: string) => {
    setMessagesLoading(true)
    setError(null)
    try {
      const bundle = await getConversationMessages(threadId)
      setActiveMessages(bundle.messages)
      setThreadState(bundle.threadState)
    }
    catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setActiveMessages([])
      setThreadState(null)
    }
    finally {
      setMessagesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!userId || activeId == null) {
      setActiveMessages(null)
      setThreadState(null)
      setMessagesLoading(false)
      return
    }

    let cancelled = false
    setActiveMessages(null)
    setThreadState(null)
    setMessagesLoading(true)

    void getConversationMessages(activeId)
      .then((bundle) => {
        if (!cancelled) {
          setActiveMessages(bundle.messages)
          setThreadState(bundle.threadState)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
          setActiveMessages([])
          setThreadState(null)
        }
      })
      .finally(() => {
        if (!cancelled)
          setMessagesLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [userId, activeId])

  const reloadActiveThread = useCallback(async () => {
    if (!activeId)
      return
    await loadActiveThread(activeId)
  }, [activeId, loadActiveThread])

  const create = useCallback(async (agentId: AgentId) => {
    const conversation = await createConversation(agentId)
    setConversations(prev => [conversation, ...prev])
    setActiveId(conversation.id)
    return conversation
  }, [])

  const pin = useCallback(async (id: string) => {
    await pinConversation(id)
    setConversations(prev =>
      prev.map(c => c.id === id ? { ...c, pinned: true } : c)
        .sort((a, b) => {
          if (a.pinned !== b.pinned)
            return a.pinned ? -1 : 1
          return b.updatedAt - a.updatedAt
        }),
    )
  }, [])

  const unpin = useCallback(async (id: string) => {
    await unpinConversation(id)
    setConversations(prev =>
      prev.map(c => c.id === id ? { ...c, pinned: false } : c)
        .sort((a, b) => {
          if (a.pinned !== b.pinned)
            return a.pinned ? -1 : 1
          return b.updatedAt - a.updatedAt
        }),
    )
  }, [])

  const remove = useCallback(async (id: string) => {
    await deleteConversation(id)
    setConversations((prev) => {
      const next = prev.filter(c => c.id !== id)
      setActiveId((current) => {
        if (current !== id)
          return current
        return next[0]?.id ?? null
      })
      return next
    })
  }, [])

  const active = conversations.find(c => c.id === activeId) ?? null

  const value = useMemo<UseConversationsResult>(() => ({
    conversations,
    activeId,
    active,
    activeMessages,
    threadState,
    isLoading,
    messagesLoading,
    error,
    select: setActiveId,
    create,
    pin,
    unpin,
    remove,
    refresh,
    reloadActiveThread,
  }), [
    conversations,
    activeId,
    active,
    activeMessages,
    threadState,
    isLoading,
    messagesLoading,
    error,
    create,
    pin,
    unpin,
    remove,
    refresh,
    reloadActiveThread,
  ])

  return (
    <ConversationsContext value={value}>
      {children}
    </ConversationsContext>
  )
}
