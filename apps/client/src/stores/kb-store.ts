import type { KbDoc, KbDocSummary, KbNodeRow, KbTagRow } from '@apis/kb-api'
import { KB_DEFAULT_ID, KbApi } from '@apis/kb-api'
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
  static readonly tagsAtom = atom<KbTagRow[]>([])
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
        KbApi.listNodes(KB_DEFAULT_ID),
        KbApi.listDocs(KB_DEFAULT_ID),
        KbApi.listTags(KB_DEFAULT_ID),
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
      const updated = await KbApi.saveDraft(doc.id, { content: doc.content, name: doc.name })
      store.set(KbStore.activeDocAtom, updated)
      store.set(KbStore.localDirtyAtom, false)
      store.set(
        KbStore.docsAtom,
        prev => prev.map(d => d.id === updated.id ? toSummary(updated) : d),
      )
    }
    catch (e) {
      store.set(KbStore.errorAtom, e instanceof Error ? e.message : String(e))
      throw e
    }
    finally {
      store.set(KbStore.savingAtom, false)
    }
  }

  /** 更新元数据（tags/parentNodeId/name/visibility/pinned）。加 tag 时后端自动建标签 */
  static async updateMeta(
    id: string,
    patch: {
      tags?: string[]
      parentNodeId?: string | null
      name?: string
      visibility?: string
      pinned?: boolean
    },
  ): Promise<KbDoc | null> {
    const store = KbStore.store()
    store.set(KbStore.errorAtom, null)
    try {
      const updated = await KbApi.updateMeta(id, patch)
      if (store.get(KbStore.activeIdAtom) === id)
        store.set(KbStore.activeDocAtom, updated)
      store.set(
        KbStore.docsAtom,
        prev => prev.map(d => d.id === updated.id ? toSummary(updated) : d),
      )
      // tags 变了 → 标签列表可能新增（后端自动建），刷新 tags
      if (patch.tags != null)
        void KbStore.refreshTags()
      return updated
    }
    catch (e) {
      store.set(KbStore.errorAtom, e instanceof Error ? e.message : String(e))
      throw e
    }
  }

  /** 仅刷新标签列表（add tag 后端自动建标签，左栏 chips 要同步） */
  static async refreshTags(): Promise<void> {
    const store = KbStore.store()
    const userId = store.get(KbStore.userIdAtom)
    if (!userId)
      return
    try {
      const tags = await KbApi.listTags(KB_DEFAULT_ID)
      store.set(KbStore.tagsAtom, tags)
    }
    catch {
      // 标签刷新失败不阻断主流程
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
      store.set(
        KbStore.docsAtom,
        prev => prev.map(d => d.id === updated.id ? toSummary(updated) : d),
      )
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
    const doc = await KbApi.createDoc(KB_DEFAULT_ID, { name: '未命名', content: '' })
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

  // ---------- 文件夹节点 ----------

  static async createFolder(name: string, parentId?: string | null): Promise<KbNodeRow> {
    const store = KbStore.store()
    store.set(KbStore.errorAtom, null)
    try {
      const node = await KbApi.createNode(KB_DEFAULT_ID, { name, parentId })
      store.set(KbStore.nodesAtom, prev => [...prev, node])
      return node
    }
    catch (e) {
      store.set(KbStore.errorAtom, e instanceof Error ? e.message : String(e))
      throw e
    }
  }

  static async renameFolder(id: string, name: string): Promise<void> {
    const store = KbStore.store()
    store.set(KbStore.errorAtom, null)
    try {
      const node = await KbApi.renameNode(id, name)
      store.set(KbStore.nodesAtom, prev => prev.map(n => n.id === id ? node : n))
      // 子树 vdir 已变：刷新文档摘要
      const docs = await KbApi.listDocs(KB_DEFAULT_ID)
      store.set(KbStore.docsAtom, docs)
    }
    catch (e) {
      store.set(KbStore.errorAtom, e instanceof Error ? e.message : String(e))
      throw e
    }
  }

  static async moveFolder(id: string, parentId: string | null): Promise<void> {
    const store = KbStore.store()
    store.set(KbStore.errorAtom, null)
    try {
      const node = parentId == null
        ? await KbApi.moveNodeToRoot(id)
        : await KbApi.moveNode(id, parentId)
      store.set(KbStore.nodesAtom, prev => prev.map(n => n.id === id ? node : n))
      const docs = await KbApi.listDocs(KB_DEFAULT_ID)
      store.set(KbStore.docsAtom, docs)
    }
    catch (e) {
      store.set(KbStore.errorAtom, e instanceof Error ? e.message : String(e))
      throw e
    }
  }

  /** 删文件夹：子文件夹 cascade；子文档 parent 变 null（根级） */
  static async removeFolder(id: string): Promise<void> {
    const store = KbStore.store()
    store.set(KbStore.errorAtom, null)
    try {
      await KbApi.deleteNode(id)
      // 整棵节点树与文档 parent/vdir 可能批量变化，直接全量刷新
      await KbStore.refresh()
    }
    catch (e) {
      store.set(KbStore.errorAtom, e instanceof Error ? e.message : String(e))
      throw e
    }
  }

  /** 文档改挂载父级（跨文件夹 / 移根）；不做同级排序 */
  static async moveDoc(id: string, parentNodeId: string | null): Promise<void> {
    await KbStore.updateMeta(id, { parentNodeId })
  }
}
