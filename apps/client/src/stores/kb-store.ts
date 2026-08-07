import type { KbDoc, KbDocSummary } from '@apis/kb-api'
import { KbApi } from '@apis/kb-api'
import { TagsStore } from '@stores/tags-store'
import { atom, getDefaultStore } from 'jotai'

const LS_ACTIVE = 'kb.activeId'
const LS_TAGS = 'kb.selectedTagIds'

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

function readSelectedTagIds(): string[] {
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

/** 文档编辑区互斥操作；同一时刻只跑一个 */
export type KbMutationKind = 'save' | 'commit' | 'delete' | 'updateMeta'

/**
 * KB 客户端 store（Phase 2：仅文档）。
 *
 * 文件夹树已并入统一 dirs，归 DirStore（dirTreeAtom）；本 store 不再持有 nodes。
 * 文档列表按 mountDirId 挂到 DirStore 树渲染（组件层组装）；refresh 只拉 docs。
 */
export class KbStore {
  static readonly userIdAtom = atom<string | undefined>(undefined)
  static readonly docsAtom = atom<KbDocSummary[]>([])
  static readonly tagsAtom = TagsStore.tagsAtom
  static readonly selectedTagIdsAtom = atom<string[]>(readSelectedTagIds())
  static readonly activeIdAtom = atom<string | null>(readLs(LS_ACTIVE))
  static readonly activeDocAtom = atom<KbDoc | null>(null)
  static readonly isLoadingAtom = atom(false)
  static readonly mutationAtom = atom<KbMutationKind | null>(null)
  static readonly savingAtom = atom(get => get(KbStore.mutationAtom) === 'save')
  static readonly committingAtom = atom(get => get(KbStore.mutationAtom) === 'commit')
  static readonly mutatingAtom = atom(get => get(KbStore.mutationAtom) != null)
  static readonly errorAtom = atom<string | null>(null)
  static readonly localDirtyAtom = atom(false)

  static readonly filteredDocsAtom = atom((get) => {
    const docs = get(KbStore.docsAtom)
    const tagIds = get(KbStore.selectedTagIdsAtom)
    if (!tagIds.length)
      return docs
    return docs.filter(d => tagIds.every(id => (d.tagIds ?? []).includes(id)))
  })

  private static loadGeneration = 0

  private static store() {
    return getDefaultStore()
  }

  /**
   * 统一 mutation：互斥 + 记 error + 不向 UI 抛错。
   * 已有 mutation 时直接返回 undefined（调用方不必再写 busy 锁）。
   */
  private static async mutate<T>(
    kind: KbMutationKind,
    fn: () => Promise<T>,
  ): Promise<T | undefined> {
    const store = KbStore.store()
    if (store.get(KbStore.mutationAtom) != null)
      return undefined
    store.set(KbStore.mutationAtom, kind)
    store.set(KbStore.errorAtom, null)
    try {
      return await fn()
    }
    catch (e) {
      store.set(KbStore.errorAtom, e instanceof Error ? e.message : String(e))
      return undefined
    }
    finally {
      store.set(KbStore.mutationAtom, null)
    }
  }

  static reset(): void {
    const store = KbStore.store()
    store.set(KbStore.docsAtom, [])
    TagsStore.reset()
    store.set(KbStore.activeIdAtom, null)
    store.set(KbStore.activeDocAtom, null)
    store.set(KbStore.isLoadingAtom, false)
    store.set(KbStore.mutationAtom, null)
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

  static setSelectedTagIds(tagIds: string[]): void {
    KbStore.store().set(KbStore.selectedTagIdsAtom, tagIds)
    writeLs(LS_TAGS, JSON.stringify(tagIds))
  }

  static toggleTag(tagId: string): void {
    const store = KbStore.store()
    const cur = store.get(KbStore.selectedTagIdsAtom)
    const next = cur.includes(tagId) ? cur.filter(t => t !== tagId) : [...cur, tagId]
    KbStore.setSelectedTagIds(next)
  }

  static async refresh(): Promise<void> {
    const store = KbStore.store()
    const userId = store.get(KbStore.userIdAtom)
    if (!userId)
      return

    store.set(KbStore.isLoadingAtom, true)
    store.set(KbStore.errorAtom, null)
    try {
      const [docs] = await Promise.all([
        KbApi.listDocs(),
        TagsStore.refreshTags(),
      ])
      store.set(KbStore.docsAtom, docs)

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

  /** 无锁保存正文；供 saveDraft / commit 内部复用 */
  private static async saveDraftBody(): Promise<void> {
    const store = KbStore.store()
    const doc = store.get(KbStore.activeDocAtom)
    if (!doc)
      return
    const updated = await KbApi.saveDraft(doc.id, { content: doc.content, name: doc.name })
    store.set(KbStore.activeDocAtom, updated)
    store.set(KbStore.localDirtyAtom, false)
    store.set(
      KbStore.docsAtom,
      prev => prev.map(d => d.id === updated.id ? toSummary(updated) : d),
    )
  }

  static async saveDraft(): Promise<void> {
    await KbStore.mutate('save', () => KbStore.saveDraftBody())
  }

  /** 更新元数据（tagIds/mountDirId/name/visibility/pinned） */
  static async updateMeta(
    id: string,
    patch: {
      tagIds?: string[]
      mountDirId?: string | null
      name?: string
      visibility?: string
      pinned?: boolean
    },
  ): Promise<KbDoc | null> {
    const updated = await KbStore.mutate('updateMeta', async () => {
      const store = KbStore.store()
      const next = await KbApi.updateMeta(id, patch)
      if (store.get(KbStore.activeIdAtom) === id)
        store.set(KbStore.activeDocAtom, next)
      store.set(
        KbStore.docsAtom,
        prev => prev.map(d => d.id === next.id ? toSummary(next) : d),
      )
      if (patch.tagIds != null)
        void TagsStore.refreshTags()
      return next
    })
    return updated ?? null
  }

  static async refreshTags(): Promise<void> {
    return TagsStore.refreshTags()
  }

  static async commit(): Promise<void> {
    await KbStore.mutate('commit', async () => {
      const store = KbStore.store()
      const doc = store.get(KbStore.activeDocAtom)
      if (!doc)
        return

      // 有本地未落库改动时先保存（仍算 commit mutation，不另抢 save 锁）
      if (store.get(KbStore.localDirtyAtom))
        await KbStore.saveDraftBody()

      try {
        const updated = await KbApi.commit(doc.id, true)
        store.set(KbStore.activeDocAtom, updated)
        store.set(KbStore.localDirtyAtom, false)
        store.set(
          KbStore.docsAtom,
          prev => prev.map(d => d.id === updated.id ? toSummary(updated) : d),
        )
      }
      catch (e) {
        void KbStore.loadDoc(doc.id)
        throw e
      }
    })
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
    await KbStore.mutate('delete', async () => {
      const store = KbStore.store()
      await KbApi.deleteDoc(id)
      store.set(KbStore.docsAtom, prev => prev.filter(d => d.id !== id))
      if (store.get(KbStore.activeIdAtom) === id) {
        store.set(KbStore.activeIdAtom, null)
        store.set(KbStore.activeDocAtom, null)
        writeLs(LS_ACTIVE, null)
      }
    })
  }

  /** 文档改挂载 dir（跨文件夹 / 移 Inbox）；零 Qdrant 写（认 id，setPayload 同步） */
  static async moveDoc(id: string, mountDirId: string | null): Promise<void> {
    await KbStore.updateMeta(id, { mountDirId })
  }
}
