import type { ConversationThread, GraphsName } from '@apis/api-types'
import { Conversation } from '@apis/conversation-api'
import { atom, getDefaultStore } from 'jotai'

const DEFAULT_GRAPHS_NAME: GraphsName = 'dev'

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
  static readonly isLoadingAtom = atom(false)
  static readonly errorAtom = atom<string | null>(null)

  static readonly activeAtom = atom((get) => {
    const activeId = get(ConversationStore.activeIdAtom)
    return get(ConversationStore.conversationsAtom).find(c => c.id === activeId) ?? null
  })

  private static store() {
    return getDefaultStore()
  }

  static reset(): void {
    const store = ConversationStore.store()
    store.set(ConversationStore.conversationsAtom, [])
    store.set(ConversationStore.activeIdAtom, null)
    store.set(ConversationStore.isLoadingAtom, false)
    store.set(ConversationStore.errorAtom, null)
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
  }
}
