import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../db/drizzle'
import { migrateAppSchema } from '../db/migrate'
import { dirs, skills, skillTags, tags, versionTexts } from '../db/schema'
import { ProjectService } from './project'
import { SkillConflictError, SkillService } from './skill'
import { TagsService } from './tags'

const USER_ID = `skill-svc-${Date.now().toString(36)}`

async function cleanup(): Promise<void> {
  await db.delete(skillTags)
  await db.delete(versionTexts).where(eq(versionTexts.userId, USER_ID))
  await db.delete(skills).where(eq(skills.userId, USER_ID))
  await db.delete(dirs).where(eq(dirs.userId, USER_ID))
  await db.delete(tags).where(eq(tags.userId, USER_ID))
}

describe('skillService e2e', () => {
  beforeAll(async () => {
    await migrateAppSchema()
    await cleanup()
  })

  afterAll(async () => {
    await cleanup()
  })

  it('create → upsert SKILL.md + scripts/a.md → walkFiles 相对路径', async () => {
    const project = await ProjectService.createProject(USER_ID, { name: 'skill-proj' })
    const root = await ProjectService.createDir(USER_ID, { parentId: project.id, name: 'weather' })
    const scripts = await ProjectService.createDir(USER_ID, { parentId: root.id, name: 'scripts' })

    const skill = await SkillService.create(USER_ID, { dirId: root.id, code: 'weather' })
    expect(skill.code).toBe('weather')

    await SkillService.upsertVersionText(USER_ID, {
      dirId: root.id,
      filename: 'SKILL.md',
      content: '---\nname: 天气\ndescription: 查天气\n---\nbody',
    })
    await SkillService.upsertVersionText(USER_ID, {
      dirId: scripts.id,
      filename: 'a.md',
      content: 'note',
    })

    const files = await SkillService.walkFiles(USER_ID, 'weather')
    expect(files).toEqual({
      'SKILL.md': '---\nname: 天气\ndescription: 查天气\n---\nbody',
      'scripts/a.md': 'note',
    })

    const index = await SkillService.buildIndex(USER_ID, ['weather'])
    expect(index.skillText).toContain('天气')
    expect(index.skillText).toContain('weather')
    expect(index.skillText).not.toContain('scripts/a.md')
    expect(index.skillBindings).toEqual([{ code: 'weather', name: '天气', strategy: 'latest' }])
  })

  it('reserved skill_code 拒绝；卸标硬删 texts、dirs 保留', async () => {
    const project = await ProjectService.createProject(USER_ID, { name: 'skill-proj-2' })
    const root = await ProjectService.createDir(USER_ID, { parentId: project.id, name: 'docs' })
    await expect(SkillService.create(USER_ID, { dirId: root.id, code: 'kb_search' }))
      .rejects
      .toBeInstanceOf(SkillConflictError)

    const skill = await SkillService.create(USER_ID, { dirId: root.id, code: 'docs_skill' })
    await SkillService.upsertVersionText(USER_ID, {
      dirId: root.id,
      filename: 'SKILL.md',
      content: 'x',
    })
    await SkillService.unmark(USER_ID, skill.id)

    const [gone] = await db.select().from(skills).where(eq(skills.id, skill.id)).limit(1)
    expect(gone).toBeUndefined()
    const texts = await db.select().from(versionTexts).where(eq(versionTexts.userId, USER_ID))
    expect(texts.filter(t => t.mountDirId === root.id)).toHaveLength(0)
    const tree = await ProjectService.listTree(USER_ID)
    expect(tree.find(d => d.id === root.id)).toBeTruthy()
  })

  it('skill 打标；删标 dry-run 含 skills', async () => {
    const project = await ProjectService.createProject(USER_ID, { name: 'skill-tag-proj' })
    const root = await ProjectService.createDir(USER_ID, { parentId: project.id, name: 'tagged' })
    const skill = await SkillService.create(USER_ID, { dirId: root.id, code: 'tagged_skill' })
    const tag = await TagsService.create(USER_ID, { name: `skill-tag-${USER_ID}` })
    await TagsService.setSkillTagIds(skill.id, USER_ID, [tag.id])
    const listed = await SkillService.list(USER_ID)
    expect(listed.find(s => s.id === skill.id)?.tagIds).toEqual([tag.id])

    const dry = await TagsService.deleteTag(tag.id, USER_ID, { mode: 'untag', dryRun: true })
    expect(dry && 'skills' in dry && dry.skills.some(s => s.id === skill.id)).toBe(true)
    await TagsService.deleteTag(tag.id, USER_ID, { mode: 'untag' })
    const after = await SkillService.list(USER_ID)
    expect(after.find(s => s.id === skill.id)?.tagIds).toEqual([])
  })

  it('中文文件夹名不会全部落到 code=skill', async () => {
    const project = await ProjectService.createProject(USER_ID, { name: 'cn-proj' })
    const a = await ProjectService.createDir(USER_ID, { parentId: project.id, name: '新文件夹' })
    const b = await ProjectService.createDir(USER_ID, { parentId: project.id, name: '天气笔记' })
    const sa = await SkillService.create(USER_ID, { dirId: a.id, code: 'skill' })
    const sb = await SkillService.create(USER_ID, { dirId: b.id, code: 'skill' })
    expect(sa.code).not.toBe(sb.code)
    expect(sa.code.startsWith('s_')).toBe(true)
    expect(sb.code.startsWith('s_')).toBe(true)
  })

  it('保存 SKILL.md 后 skills.code 同步为 frontmatter name', async () => {
    const project = await ProjectService.createProject(USER_ID, { name: 'name-sync' })
    const root = await ProjectService.createDir(USER_ID, { parentId: project.id, name: '大狗' })
    const skill = await SkillService.create(USER_ID, { dirId: root.id })
    expect(skill.code).not.toBe('bark')
    await SkillService.upsertVersionText(USER_ID, {
      dirId: root.id,
      filename: 'SKILL.md',
      content: '---\nname: bark\ndescription: 一个大狗叫的应对策略\n---\n叫叫叫~\n',
    })
    const listed = await SkillService.list(USER_ID)
    expect(listed.find(s => s.id === skill.id)?.code).toBe('bark')
  })
})
