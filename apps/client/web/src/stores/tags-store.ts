import type { PerspectiveEntityRef } from '@agent/gtd'
import type { TagRow } from '@apis/tags-api'
import { TagsApi } from '@apis/tags-api'
import { atom, getDefaultStore } from 'jotai'

/**
 * 标签目录客户端内存 store（公共 tags 表 REST）。
 *
 * 标签目录退出 GTD sync，与 DirStore 同构：纯内存、list 全量、mutation 后 refresh。
 * 任务打标绑定仍走 sync `task_tag`（本 store 不管关联行）。
 */
export class TagsStore {
  static readonly tagsAtom = atom<TagRow[]>([])

  static readonly tagsByIdAtom = atom((get) => {
    const map = new Map<string, TagRow>()
    for (const t of get(TagsStore.tagsAtom))
      map.set(t.id, t)
    return map
  })

  /** 透视校验 / 过滤编辑器：id+name */
  static readonly tagRefsAtom = atom<PerspectiveEntityRef[]>(get =>
    get(TagsStore.tagsAtom).map(t => ({ id: t.id, name: t.name })))

  private static store() {
    return getDefaultStore()
  }

  static reset(): void {
    TagsStore.store().set(TagsStore.tagsAtom, [])
  }

  static async refreshTags(): Promise<void> {
    try {
      const tags = await TagsApi.list()
      TagsStore.store().set(TagsStore.tagsAtom, tags)
    }
    catch {
      // 标签刷新失败不阻断主流程
    }
  }

  static async create(name: string, color?: string): Promise<TagRow> {
    const tag = await TagsApi.create({ name, ...(color ? { color } : {}) })
    await TagsStore.refreshTags()
    return tag
  }

  static async rename(id: string, name: string): Promise<void> {
    await TagsApi.rename(id, name)
    await TagsStore.refreshTags()
  }

  static async updateColor(id: string, color: string | null): Promise<void> {
    await TagsApi.updateColor(id, color)
    await TagsStore.refreshTags()
  }

  static async deleteTag(
    id: string,
    body: {
      mode: 'untag' | 'delete_entities'
      dryRun?: boolean
      docIds?: string[]
      taskIds?: string[]
    },
  ) {
    const result = await TagsApi.deleteTag(id, body)
    if (!body.dryRun)
      await TagsStore.refreshTags()
    return result
  }
}
