import type { TagRow } from '@apis/tags-api'
import { TagsApi } from '@apis/tags-api'
import { atom, getDefaultStore } from 'jotai'

export class TagsStore {
  static readonly tagsAtom = atom<TagRow[]>([])

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
