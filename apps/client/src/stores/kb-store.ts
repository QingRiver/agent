import type { KbDoc, KbDocSummary, KbNodeRow } from '@apis/kb-api'
import { KbApi } from '@apis/kb-api'
import { atom, getDefaultStore } from 'jotai'

const LS_ACTIVE = 'kb.activeId'
const LS_TAGS = 'kb.selectedTags'

function readLs(key: string): string | null {
  try {
    return localStorage.getItem(key)
  }
  catch {
    return null
  }
}

function writeLs(key: string, value: string | null): void {
  try {
    if (value == null)
      localStorage.removeItem(key)
    else
      localStorage.setItem(key, value)
  }
  catch {
    // ignore
  }
}

function readSelectedTags(): string[] {
  const raw = readLs(LS_TAGS)
  if (!raw)
    return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : []
  }
  catch {
    return []
  }
}

export function isDocDirty(doc: Pick<KbDocSummary, 'draftHash' | 'publishedHash' | 'indexingStatus'>): boolean {
  if (doc.indexingStatus === 'draft' || doc.indexingStatus === 'indexing' || doc.indexingStatus === 'error')
    return true
  return doc.draftHash != null && doc.draftHash !== doc.publishedHash
}

function toSummary(doc: KbDoc): KbDocSummary {
  const { content: _c, permissions: _p, ...rest } = doc
  return rest
}

export class KbStore {
  static readonly userIdAtom = atom<string | undefined>(undefined)
  static readonly nodesAtom = atom<KbNodeRow[]>([])
  static readonly docsAtom = atom<KbDocSummary[]>([])
  static readonly tagsAtom = atom<string[]>([])
  static readonly selectedTagsAtom = atom<string[]>(readSelectedTags())
  static readonly activeIdAtom = atom<string | null>(readLs(LS_ACTIVE))
  static readonly activeDocAtom = atom<KbDoc | null>(null)
  static readonly isLoadingAtom = atom(false)
  static readonly savingAtom = atom(false)
  static readonly committingAtom = atom(false)
  static readonly errorAtom = atom<string | null>(null)
  static readonly localDirtyAtom = atom(false)

  static readonly filteredDocsAtom = atom((get) => {
    const docs = get(KbStore.docsAtom)
    const tags = get(KbStore.selectedTagsAtom)
    if (!tags.length)
      return docs
    return docs.filter(d => tags.every(t => (d.tags ?? []).includes(t)))
  })

  private static loadGeneration = 0

  private static store() {
    return getDefaultStore()
  }

  static reset(): void {
    const store = KbStore.store()
    store.set(KbStore.nodesAtom, [])
    store.set(KbStore.docsAtom, [])
    store.set(KbStore.tagsAtom, [])
    store.set(KbStore.activeIdAtom, null)
    store.set(KbStore.activeDocAtom, null)
    store.set(KbStore.isLoadingAtom, false)
    store.set(KbStore.savingAtom, false)
    store.set(KbStore.committingAtom, false)
    store.set(KbStore.errorAtom, null)
    store.set(KbStore.localDirtyAtom, false)
    KbStore.loadGeneration += 1
    writeLs(LS_ACTIVE, null)
  }

  static onUserIdChange(userId: string | undefined): void {
    const store = KbStore.store()
    const prev = store.get(KbStore.userIdAtom)
    if (prev === userId)
      return
    store.set(KbStore.userIdAtom, userId)
    if (!userId) {
      KbStore.reset()
      return
    }
    void KbStore.refresh()
  }

  static setSelectedTags(tags: string[]): void {
    KbStore.store().set(KbStore.selectedTagsAtom, tags)
    writeLs(LS_TAGS, JSON.stringify(tags))
  }

  static toggleTag(tag: string): void {
    const store = KbStore.store()
    const cur = store.get(KbStore.selectedTagsAtom)
    const next = cur.includes(tag) ? cur.filter(t => t !== tag) : [...cur, tag]
    KbStore.setSelectedTags(next)
  }

  static async refresh(): Promise<void> {
    const store = KbStore.store()
    const userId = store.get(KbStore.userIdAtom)
    if (!userId)
      return

    store.set(KbStore.isLoadingAtom, true)
    store.set(KbStore.errorAtom, null)
    try {
      const [nodes, docs, tags] = await Promise.all([
        KbApi.listNodes(),
        KbApi.listDocs(),
        KbApi.listTags(),
      ])
      store.set(KbStore.nodesAtom, nodes)
      store.set(KbStore.docsAtom, docs)
      store.set(KbStore.tagsAtom, tags)

      const prevActive = store.get(KbStore.activeIdAtom)
      if (prevActive && docs.some(d => d.id === prevActive)) {
        void KbStore.loadDoc(prevActive)
      }
      else if (prevActive) {
        store.set(KbStore.activeIdAtom, null)
        store.set(KbStore.activeDocAtom, null)
        writeLs(LS_ACTIVE, null)
      }
    }
    catch (e) {
      store.set(KbStore.errorAtom, e instanceof Error ? e.message : String(e))
    }
    finally {
      store.set(KbStore.isLoadingAtom, false)
    }
  }

  static select(id: string): void {
    const store = KbStore.store()
    store.set(KbStore.activeIdAtom, id)
    store.set(KbStore.localDirtyAtom, false)
    writeLs(LS_ACTIVE, id)
    void KbStore.loadDoc(id)
  }

  static async loadDoc(id: string): Promise<void> {
    const store = KbStore.store()
    const gen = ++KbStore.loadGeneration
    store.set(KbStore.errorAtom, null)
    try {
      const doc = await KbApi.getDoc(id)
      if (gen !== KbStore.loadGeneration)
        return
      if (store.get(KbStore.activeIdAtom) !== id)
        return
      store.set(KbStore.activeDocAtom, doc)
      store.set(KbStore.localDirtyAtom, false)
      store.set(KbStore.docsAtom, prev => prev.map(d => d.id === id ? toSummary(doc) : d))
    }
    catch (e) {
      if (gen !== KbStore.loadGeneration)
        return
      store.set(KbStore.errorAtom, e instanceof Error ? e.message : String(e))
    }
  }

  static updateLocalContent(content: string): void {
    const store = KbStore.store()
    const doc = store.get(KbStore.activeDocAtom)
    if (!doc)
      return
    store.set(KbStore.activeDocAtom, { ...doc, content })
    store.set(KbStore.localDirtyAtom, true)
  }

  static updateLocalName(name: string): void {
    const store = KbStore.store()
    const doc = store.get(KbStore.activeDocAtom)
    if (!doc)
      return
    store.set(KbStore.activeDocAtom, { ...doc, name })
    store.set(KbStore.localDirtyAtom, true)
  }

  static async saveDraft(): Promise<void> {
    const store = KbStore.store()
    const doc = store.get(KbStore.activeDocAtom)
    if (!doc)
      return
    store.set(KbStore.savingAtom, true)
    store.set(KbStore.errorAtom, null)
    try {
      const updated = await KbApi.patchDoc(doc.id, { content: doc.content, name: doc.name })
      store.set(KbStore.activeDocAtom, updated)
      store.set(KbStore.localDirtyAtom, false)
      store.set(KbStore.docsAtom, prev => prev.map(d => d.id === updated.id ? toSummary(updated) : d))
    }
    catch (e) {
      store.set(KbStore.errorAtom, e instanceof Error ? e.message : String(e))
      throw e
    }
    finally {
      store.set(KbStore.savingAtom, false)
    }
  }

  static async commit(): Promise<void> {
    const store = KbStore.store()
    const doc = store.get(KbStore.activeDocAtom)
    if (!doc)
      return

    // 有本地未落库改动时先保存
    if (store.get(KbStore.localDirtyAtom))
      await KbStore.saveDraft()

    store.set(KbStore.committingAtom, true)
    store.set(KbStore.errorAtom, null)
    try {
      const updated = await KbApi.commit(doc.id, true)
      store.set(KbStore.activeDocAtom, updated)
      store.set(KbStore.localDirtyAtom, false)
      store.set(KbStore.docsAtom, prev => prev.map(d => d.id === updated.id ? toSummary(updated) : d))
    }
    catch (e) {
      store.set(KbStore.errorAtom, e instanceof Error ? e.message : String(e))
      // 提交失败后刷新拿到 error 状态
      void KbStore.loadDoc(doc.id)
      throw e
    }
    finally {
      store.set(KbStore.committingAtom, false)
    }
  }

  static async createBlank(): Promise<KbDoc> {
    const store = KbStore.store()
    const doc = await KbApi.createDoc({ name: '未命名', content: '' })
    store.set(KbStore.docsAtom, prev => [toSummary(doc), ...prev])
    store.set(KbStore.activeIdAtom, doc.id)
    store.set(KbStore.activeDocAtom, doc)
    store.set(KbStore.localDirtyAtom, false)
    writeLs(LS_ACTIVE, doc.id)
    return doc
  }

  static async remove(id: string): Promise<void> {
    const store = KbStore.store()
    await KbApi.deleteDoc(id)
    store.set(KbStore.docsAtom, prev => prev.filter(d => d.id !== id))
    if (store.get(KbStore.activeIdAtom) === id) {
      store.set(KbStore.activeIdAtom, null)
      store.set(KbStore.activeDocAtom, null)
      writeLs(LS_ACTIVE, null)
    }
  }
}
