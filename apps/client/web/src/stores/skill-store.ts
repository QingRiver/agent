import type { SkillRow, VersionTextRow } from '@apis/skill-api'
import { SKILL_ENTRY_FILENAME, slugifySkillCode } from '@agent/proto'
import { SkillApi } from '@apis/skill-api'
import { atom, getDefaultStore } from 'jotai'

export class SkillStore {
  static readonly skillsAtom = atom<SkillRow[]>([])
  static readonly textsAtom = atom<VersionTextRow[]>([])
  static readonly errorAtom = atom<string | null>(null)

  static readonly skillsByDirIdAtom = atom((get) => {
    const map = new Map<string, SkillRow>()
    for (const s of get(SkillStore.skillsAtom))
      map.set(s.dirId, s)
    return map
  })

  private static store() {
    return getDefaultStore()
  }

  static reset(): void {
    SkillStore.store().set(SkillStore.skillsAtom, [])
    SkillStore.store().set(SkillStore.textsAtom, [])
    SkillStore.store().set(SkillStore.errorAtom, null)
  }

  static async refresh(): Promise<void> {
    try {
      const [skills, texts] = await Promise.all([
        SkillApi.list(),
        SkillApi.listAllVersionTexts(),
      ])
      SkillStore.store().set(SkillStore.skillsAtom, skills)
      SkillStore.store().set(SkillStore.textsAtom, texts)
      SkillStore.store().set(SkillStore.errorAtom, null)
    }
    catch (e) {
      SkillStore.store().set(SkillStore.errorAtom, e instanceof Error ? e.message : String(e))
    }
  }

  static async create(dirId: string, code?: string): Promise<SkillRow> {
    const skill = await SkillApi.create({ dirId, ...(code ? { code } : {}) })
    await SkillStore.refresh()
    return skill
  }

  /** 把 kind=dir 打成 skill，并补 SKILL.md。中文名不传 code，交给服务端分配。 */
  static async markDir(dirId: string, dir: { name: string, kind: string }): Promise<SkillRow> {
    try {
      if (dir.kind !== 'dir')
        throw new Error('只能把子文件夹升级为 Skill（项目根不行）')
      const slug = slugifySkillCode(dir.name)
      const code = slug === 'skill' && dir.name.trim().toLowerCase() !== 'skill' ? undefined : slug
      const skill = await SkillStore.create(dirId, code)
      const texts = SkillStore.store().get(SkillStore.textsAtom)
      const exists = texts.some(t => t.mountDirId === dirId && t.filename === SKILL_ENTRY_FILENAME)
      if (!exists) {
        await SkillStore.upsertText({
          dirId,
          filename: SKILL_ENTRY_FILENAME,
          content: `---\nname: ${dir.name.replace(/[\n\r]+/g, ' ')}\ndescription: \n---\n`,
        })
      }
      return skill
    }
    catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      SkillStore.store().set(SkillStore.errorAtom, msg)
      throw e
    }
  }

  static async unmark(id: string): Promise<void> {
    await SkillApi.unmark(id)
    await SkillStore.refresh()
  }

  static async setTagIds(id: string, tagIds: string[]): Promise<void> {
    const skill = await SkillApi.setTagIds(id, tagIds)
    const store = SkillStore.store()
    store.set(SkillStore.skillsAtom, prev => prev.map(s => s.id === skill.id ? skill : s))
  }

  static async upsertText(body: { dirId: string, filename: string, content: string }): Promise<VersionTextRow> {
    const text = await SkillApi.upsertVersionText(body)
    const store = SkillStore.store()
    store.set(SkillStore.textsAtom, (prev) => {
      const idx = prev.findIndex(t => t.id === text.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = text
        return next
      }
      const byPath = prev.findIndex(t => t.mountDirId === text.mountDirId && t.filename === text.filename)
      if (byPath >= 0) {
        const next = [...prev]
        next[byPath] = text
        return next
      }
      return [...prev, text]
    })
    return text
  }

  static async deleteText(id: string): Promise<void> {
    await SkillApi.deleteVersionText(id)
    SkillStore.store().set(SkillStore.textsAtom, prev => prev.filter(t => t.id !== id))
  }
}
