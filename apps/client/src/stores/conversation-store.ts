import type { ConversationThread, GraphsName, ThreadState } from '@apis/api-types'
import { Conversation } from '@apis/conversation-api'
import { atom, getDefaultStore } from 'jotai'

const DEFAULT_GRAPHS_NAME: GraphsName = 'simple'

export interface UseConversationsResult {
  conversations: ConversationThread[]
  activeId: string | null
  active: ConversationThread | null
  threadState: ThreadState | null
  isLoading: boolean
  threadStateLoading: boolean
  error: string | null
  select: (id: string) => void
  create: (graphsName: GraphsName) => Promise<ConversationThread>
  pin: (id: string) => Promise<void>
  unpin: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
  refresh: () => Promise<void>
  reloadActiveThread: () => Promise<void>
}

interface ThreadBundle {
  threadId: string
  threadState: ThreadState
}

function sortConversations(list: ConversationThread[]): ConversationThread[] {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned)
      return a.pinned ? -1 : 1
    return b.updatedAt - a.updatedAt
  })
}

export class ConversationStore {
  static readonly userIdAtom = atom<string | undefined>(undefined)
  static readonly conversationsAtom = atom<ConversationThread[]>([])
  static readonly activeIdAtom = atom<string | null>(null)
  static readonly threadBundleAtom = atom<ThreadBundle | null>(null)
  static readonly threadBundleLoadingAtom = atom(false)
  static readonly isLoadingAtom = atom(false)
  static readonly errorAtom = atom<string | null>(null)

  static readonly activeAtom = atom((get) => {
    const activeId = get(ConversationStore.activeIdAtom)
    return get(ConversationStore.conversationsAtom).find(c => c.id === activeId) ?? null
  })

  static readonly threadStateAtom = atom((get) => {
    const activeId = get(ConversationStore.activeIdAtom)
    const bundle = get(ConversationStore.threadBundleAtom)
    if (bundle?.threadId !== activeId)
      return null
    return bundle.threadState
  })

  static readonly showThreadStateLoadingAtom = atom((get) => {
    const userId = get(ConversationStore.userIdAtom)
    const activeId = get(ConversationStore.activeIdAtom)
    const bundle = get(ConversationStore.threadBundleAtom)
    const loading = get(ConversationStore.threadBundleLoadingAtom)
    return Boolean(userId && activeId != null && (loading || bundle?.threadId !== activeId))
  })

  private static loadGeneration = 0

  private static store() {
    return getDefaultStore()
  }

  static reset(): void {
    const store = ConversationStore.store()
    store.set(ConversationStore.conversationsAtom, [])
    store.set(ConversationStore.activeIdAtom, null)
    store.set(ConversationStore.threadBundleAtom, null)
    store.set(ConversationStore.threadBundleLoadingAtom, false)
    store.set(ConversationStore.isLoadingAtom, false)
    store.set(ConversationStore.errorAtom, null)
    ConversationStore.loadGeneration += 1
  }

  static onUserIdChange(userId: string | undefined): void {
    const store = ConversationStore.store()
    const prev = store.get(ConversationStore.userIdAtom)
    if (prev === userId)
      return
    store.set(ConversationStore.userIdAtom, userId)
    if (!userId) {
      ConversationStore.reset()
      return
    }
    void ConversationStore.refresh()
  }

  static select(id: string): void {
    ConversationStore.store().set(ConversationStore.activeIdAtom, id)
  }

  static async refresh(): Promise<void> {
    const store = ConversationStore.store()
    const userId = store.get(ConversationStore.userIdAtom)
    if (!userId)
      return

    store.set(ConversationStore.isLoadingAtom, true)
    store.set(ConversationStore.errorAtom, null)
    try {
      let list = await Conversation.list()
      if (list.length === 0) {
        const created = await Conversation.create(DEFAULT_GRAPHS_NAME)
        list = [created]
      }
      store.set(ConversationStore.conversationsAtom, list)
      const prevActive = store.get(ConversationStore.activeIdAtom)
      const nextActive = prevActive && list.some(c => c.id === prevActive)
        ? prevActive
        : list[0]?.id ?? null
      store.set(ConversationStore.activeIdAtom, nextActive)
    }
    catch (e) {
      store.set(ConversationStore.errorAtom, e instanceof Error ? e.message : String(e))
    }
    finally {
      store.set(ConversationStore.isLoadingAtom, false)
    }
  }

  /** 拉取 threadState（如 HITL pendingInterrupt）；聊天消息由 copilotkit connect 恢复 */
  static async loadThreadState(threadId: string): Promise<void> {
    const store = ConversationStore.store()
    const gen = ++ConversationStore.loadGeneration
    store.set(ConversationStore.threadBundleLoadingAtom, true)
    store.set(ConversationStore.errorAtom, null)
    try {
      const bundle = await Conversation.messages(threadId)
      if (gen !== ConversationStore.loadGeneration)
        return
      if (store.get(ConversationStore.activeIdAtom) !== threadId)
        return
      store.set(ConversationStore.threadBundleAtom, {
        threadId,
        threadState: bundle.threadState,
      })
    }
    catch (e) {
      if (gen !== ConversationStore.loadGeneration)
        return
      if (store.get(ConversationStore.activeIdAtom) !== threadId)
        return
      store.set(ConversationStore.errorAtom, e instanceof Error ? e.message : String(e))
      store.set(ConversationStore.threadBundleAtom, {
        threadId,
        threadState: { pendingInterrupt: null },
      })
    }
    finally {
      if (gen === ConversationStore.loadGeneration)
        store.set(ConversationStore.threadBundleLoadingAtom, false)
    }
  }

  static async reloadActiveThread(): Promise<void> {
    const activeId = ConversationStore.store().get(ConversationStore.activeIdAtom)
    if (!activeId)
      return
    await ConversationStore.loadThreadState(activeId)
  }

  static async create(graphsName: GraphsName): Promise<ConversationThread> {
    const store = ConversationStore.store()
    const conversation = await Conversation.create(graphsName)
    store.set(ConversationStore.conversationsAtom, prev => [conversation, ...prev])
    store.set(ConversationStore.activeIdAtom, conversation.id)
    return conversation
  }

  static async pin(id: string): Promise<void> {
    await Conversation.pin(id)
    ConversationStore.store().set(
      ConversationStore.conversationsAtom,
      prev => sortConversations(prev.map(c => c.id === id ? { ...c, pinned: true } : c)),
    )
  }

  static async unpin(id: string): Promise<void> {
    await Conversation.unpin(id)
    ConversationStore.store().set(
      ConversationStore.conversationsAtom,
      prev => sortConversations(prev.map(c => c.id === id ? { ...c, pinned: false } : c)),
    )
  }

  static async remove(id: string): Promise<void> {
    const store = ConversationStore.store()
    await Conversation.delete(id)
    const next = store.get(ConversationStore.conversationsAtom).filter(c => c.id !== id)
    store.set(ConversationStore.conversationsAtom, next)
    const current = store.get(ConversationStore.activeIdAtom)
    if (current === id)
      store.set(ConversationStore.activeIdAtom, next[0]?.id ?? null)
    const bundle = store.get(ConversationStore.threadBundleAtom)
    if (bundle?.threadId === id)
      store.set(ConversationStore.threadBundleAtom, null)
  }
}
