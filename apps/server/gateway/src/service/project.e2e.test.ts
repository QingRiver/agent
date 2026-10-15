import { ProjectDirError } from '@agent/project'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../db/drizzle'
import { dirs, gtdTasks } from '../db/schema'
import { ProjectService } from './project'

const USER_ID = `proj-svc-${Date.now().toString(36)}`

async function cleanup(): Promise<void> {
  await db.delete(gtdTasks).where(eq(gtdTasks.userId, USER_ID))
  await db.delete(dirs).where(eq(dirs.userId, USER_ID))
}

/**
 * dirs 在线服务 e2e（ProjectService 直测）。
 * 覆盖 plan §6 step 6：建 project 根 → 建 dir 子节点 → rename/move（跨 project 拒绝）
 * → delete 空校验。结构纯函数由 @agent/project 单测覆盖，此处验落库。
 */
describe('projectService e2e (dirs 在线 API)', () => {
  beforeAll(async () => {
    await cleanup()
  })

  afterAll(async () => {
    await cleanup()
  })

  it('createProject → project 根（parentId=null, projectId=self, vdir=name）', async () => {
    const p = await ProjectService.createProject(USER_ID, { name: '工作' })
    expect(p.kind).toBe('project')
    expect(p.parentId).toBeNull()
    expect(p.projectId).toBe(p.id)
    expect(p.vdir).toBe('工作')
  })

  it('createDir → 子节点（projectId 回溯根, vdir=父/子）', async () => {
    const parent = await ProjectService.createProject(USER_ID, { name: '生活' })
    const child = await ProjectService.createDir(USER_ID, { parentId: parent.id, name: '家务' })
    expect(child.kind).toBe('dir')
    expect(child.parentId).toBe(parent.id)
    expect(child.projectId).toBe(parent.id)
    expect(child.vdir).toBe('生活/家务')
  })

  it('同级同名 → ProjectDirError（409）', async () => {
    const parent = await ProjectService.createProject(USER_ID, { name: 'dup-proj' })
    await ProjectService.createDir(USER_ID, { parentId: parent.id, name: 'A' })
    await expect(ProjectService.createDir(USER_ID, { parentId: parent.id, name: 'A' }))
      .rejects
      .toThrow(ProjectDirError)
  })

  it('rename → 子树 vdir 重算', async () => {
    const parent = await ProjectService.createProject(USER_ID, { name: 'rn-proj' })
    const child = await ProjectService.createDir(USER_ID, { parentId: parent.id, name: '旧名' })
    const grand = await ProjectService.createDir(USER_ID, { parentId: child.id, name: '孙' })
    await ProjectService.rename(USER_ID, child.id, '新名')

    const tree = await ProjectService.listTree(USER_ID)
    const c = tree.find(d => d.id === child.id)
    const g = tree.find(d => d.id === grand.id)
    expect(c?.name).toBe('新名')
    expect(c?.vdir).toBe('rn-proj/新名')
    expect(g?.vdir).toBe('rn-proj/新名/孙')
  })

  it('move project 根 → 拒绝（project 不可移动）', async () => {
    const p1 = await ProjectService.createProject(USER_ID, { name: 'root1' })
    const p2 = await ProjectService.createProject(USER_ID, { name: 'root2' })
    await expect(ProjectService.move(USER_ID, p1.id, { newParentId: p2.id }))
      .rejects
      .toThrow(ProjectDirError)
  })

  it('move 跨 project → 拒绝，目录留在原项目', async () => {
    const a = await ProjectService.createProject(USER_ID, { name: 'A' })
    const a1 = await ProjectService.createDir(USER_ID, { parentId: a.id, name: 'a1' })
    const b = await ProjectService.createProject(USER_ID, { name: 'B' })

    await expect(ProjectService.move(USER_ID, a1.id, { newParentId: b.id }))
      .rejects
      .toThrow('禁止跨项目移动目录')

    const tree = await ProjectService.listTree(USER_ID)
    const stayed = tree.find(d => d.id === a1.id)
    expect(stayed?.parentId).toBe(a.id)
    expect(stayed?.projectId).toBe(a.id)
    expect(stayed?.vdir).toBe('A/a1')
  })

  it('delete 非空（有子 dir）→ 拒绝；清空后软删', async () => {
    const parent = await ProjectService.createProject(USER_ID, { name: 'del-proj' })
    const child = await ProjectService.createDir(USER_ID, { parentId: parent.id, name: 'child' })

    await expect(ProjectService.delete(USER_ID, parent.id)).rejects.toThrow(ProjectDirError)

    // 删子再删父
    await ProjectService.delete(USER_ID, child.id)
    await ProjectService.delete(USER_ID, parent.id)

    const tree = await ProjectService.listTree(USER_ID)
    expect(tree.find(d => d.id === parent.id)).toBeUndefined()
    expect(tree.find(d => d.id === child.id)).toBeUndefined()
  })
})
