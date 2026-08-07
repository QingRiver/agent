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
 * Phase 1 dirs 在线服务 e2e（ProjectService 直测）。
 * 覆盖 plan §6 step 6：建 project 根 → 建 dir 子节点 → rename/move（含跨 project 级联
 * task projectId）→ delete 空校验。结构纯函数由 @agent/project 单测覆盖，此处验落库 + 级联。
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

  it('move 跨 project → 子树 dir projectId 级联 + 挂载 task projectId 更新', async () => {
    // project A / dirA1（挂一个 task）/ project B
    const a = await ProjectService.createProject(USER_ID, { name: 'A' })
    const a1 = await ProjectService.createDir(USER_ID, { parentId: a.id, name: 'a1' })
    const b = await ProjectService.createProject(USER_ID, { name: 'B' })

    // 插一个挂载到 a1 的 task（projectId 当前 = A）
    const taskId = `task-${a1.id}`
    await db.insert(gtdTasks).values({
      id: taskId,
      userId: USER_ID,
      name: '挂 a1 的任务',
      status: 'active',
      mountDirId: a1.id,
      projectId: a.id,
      parentId: null,
      sortOrder: 0,
      flagged: false,
      deleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // 把 a1 移到 B 下
    await ProjectService.move(USER_ID, a1.id, { newParentId: b.id })

    const tree = await ProjectService.listTree(USER_ID)
    const moved = tree.find(d => d.id === a1.id)
    expect(moved?.parentId).toBe(b.id)
    expect(moved?.projectId).toBe(b.id) // 级联到新 project 根
    expect(moved?.vdir).toBe('B/a1')

    // task projectId 被级联更新为 B
    const [task] = await db.select().from(gtdTasks).where(eq(gtdTasks.id, taskId)).limit(1)
    expect(task?.projectId).toBe(b.id)
    expect(task?.mountDirId).toBe(a1.id) // mountDirId 不变（权威）
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
