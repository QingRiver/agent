import { TaskUpsertPatchSchema } from '@agent/gtd'
import { eq, like } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../db/drizzle'
import { migrateAppSchema } from '../db/migrate'
import {
  dirs,
  gtdAttachments,
  gtdPerspectives,
  gtdSyncClocks,
  gtdSyncMutations,
  gtdTasks,
  gtdTaskTags,
  tags,
} from '../db/schema'
import { applyPushToPg, pullFromPg } from './sync-repository'

const USER_ID = `sync-e2e-${Date.now().toString(36)}`
const NOW = '2026-07-17T09:00:00.000Z'

async function cleanup(): Promise<void> {
  await db.delete(gtdTaskTags).where(eq(gtdTaskTags.userId, USER_ID))
  await db.delete(gtdAttachments).where(eq(gtdAttachments.userId, USER_ID))
  await db.delete(gtdTasks).where(eq(gtdTasks.userId, USER_ID))
  await db.delete(gtdPerspectives).where(eq(gtdPerspectives.userId, USER_ID))
  await db.delete(tags).where(eq(tags.userId, USER_ID))
  await db.delete(dirs).where(eq(dirs.userId, USER_ID))
  await db.delete(gtdSyncMutations).where(eq(gtdSyncMutations.userId, USER_ID))
  await db.delete(gtdSyncClocks).where(eq(gtdSyncClocks.userId, USER_ID))
}

/**
 * 清理历史泄露的 sync-e2e-* 测试用户行。
 * 各 entity 表 id 是全局 PK（非按用户），跨 run 复用同一 entityId（如 'c1'）会触发
 * onConflictDoUpdate(target: id) 把行 update 到旧 userId 名下 → 本用户 pull 为空（单侧 bug）。
 * 删除所有 sync-e2e-* 用户残留行避免撞车。
 */
async function cleanupLeaked(): Promise<void> {
  const pattern = 'sync-e2e-%'
  await db.delete(gtdTaskTags).where(like(gtdTaskTags.userId, pattern))
  await db.delete(gtdAttachments).where(like(gtdAttachments.userId, pattern))
  await db.delete(gtdTasks).where(like(gtdTasks.userId, pattern))
  await db.delete(gtdPerspectives).where(like(gtdPerspectives.userId, pattern))
  await db.delete(tags).where(like(tags.userId, pattern))
  await db.delete(dirs).where(like(dirs.userId, pattern))
  await db.delete(gtdSyncMutations).where(like(gtdSyncMutations.userId, pattern))
  await db.delete(gtdSyncClocks).where(like(gtdSyncClocks.userId, pattern))
}

/** 插入 dir 行（Phase 1 统一 dirs 树：project 根 / dir 子节点） */
async function insertDir(row: {
  id: string
  parentId: string | null
  kind: 'project' | 'dir'
  name: string
  projectId: string
  vdir: string
  sortOrder?: number
}): Promise<void> {
  await db.insert(dirs).values({
    id: row.id,
    userId: USER_ID,
    parentId: row.parentId,
    kind: row.kind,
    name: row.name,
    sortOrder: row.sortOrder ?? 0,
    projectId: row.projectId,
    vdir: row.vdir,
    ownerId: USER_ID,
  })
}

/** 构造 task upsert patch（Phase 1：mountDirId 权威挂载，projectId 退出 LWW 不在 patch） */
function taskPatch(overrides: Partial<Record<string, unknown>> & { name: string }): Record<string, unknown> {
  return {
    status: 'active',
    flagged: false,
    parentId: null,
    order: 0,
    groupType: null,
    deferDate: null,
    dueDate: null,
    completedAt: null,
    droppedAt: null,
    estimateMinutes: null,
    repeatRuleId: null,
    repeatRule: undefined,
    repeatedFromTaskId: null,
    createdAt: NOW,
    updatedAt: NOW,
    note: null,
    ...overrides,
  }
}

describe('sync-repository e2e (push/pull 落库)', () => {
  beforeAll(async () => {
    await migrateAppSchema()
    await cleanupLeaked()
    await cleanup()
  })

  afterAll(async () => {
    await cleanup()
  })

  it('push task upsert → pull 返回该行', async () => {
    const res = await applyPushToPg(USER_ID, {
      mutations: [
        {
          id: 'm1',
          entity: 'task',
          entityId: 't1',
          op: 'upsert',
          patch: {
            name: '买菜',
            status: 'active',
            flagged: false,
            parentId: null,
            order: 0,
            groupType: null,
            deferDate: null,
            dueDate: null,
            completedAt: null,
            droppedAt: null,
            estimateMinutes: null,
            repeatRuleId: null,
            repeatRule: undefined,
            repeatedFromTaskId: null,
            createdAt: NOW,
            updatedAt: NOW,
            note: null,
          },
          clientTs: NOW,
        },
      ],
      commands: [],
      lastSyncId: 0,
    })

    expect(res.applied).toContain('m1')
    expect(res.rejected).toEqual([])
    expect(res.serverSyncId).toBeGreaterThan(0)

    const pullRes = await pullFromPg(USER_ID, 0)
    const task = pullRes.changes.find(r => r.entity === 'task' && r.id === 't1')
    expect(task).toBeDefined()
    expect((task as { data: { name: string } }).data.name).toBe('买菜')
  })

  it('push complete+repeat → 新实例克隆 + 旧任务 completed', async () => {
    // 先建一个带 repeat 的 task
    await applyPushToPg(USER_ID, {
      mutations: [
        {
          id: 'm-setup',
          entity: 'task',
          entityId: 't-rep',
          op: 'upsert',
          patch: {
            name: '每周复盘',
            status: 'active',
            flagged: true,
            parentId: null,
            order: 0,
            groupType: null,
            deferDate: null,
            dueDate: null,
            completedAt: null,
            droppedAt: null,
            estimateMinutes: null,
            repeatRuleId: 'r1',
            repeatRule: {
              id: 'r1',
              cycle: 'daily',
              interval: 1,
              anchor: 'completion',
              daysOfWeek: [],
              endDate: null,
              maxOccurrences: null,
              completedOccurrences: 0,
            },
            repeatedFromTaskId: null,
            createdAt: NOW,
            updatedAt: NOW,
            note: null,
          },
          clientTs: NOW,
        },
      ],
      commands: [],
      lastSyncId: 0,
    })

    // complete + repeat
    const res = await applyPushToPg(USER_ID, {
      mutations: [],
      commands: [
        {
          id: 'c-complete',
          type: 'complete',
          taskId: 't-rep',
          clientGenerated: { nextTaskId: 't-rep-next' },
          clientTs: NOW,
        },
      ],
      lastSyncId: 0,
    })

    expect(res.applied).toContain('c-complete')
    expect(res.rejected).toEqual([])

    const pullRes = await pullFromPg(USER_ID, 0)
    const oldTask = pullRes.changes.find(r => r.entity === 'task' && r.id === 't-rep')
    const newTask = pullRes.changes.find(r => r.entity === 'task' && r.id === 't-rep-next')

    expect(oldTask).toBeDefined()
    expect((oldTask as { data: { status: string } }).data.status).toBe('completed')
    expect(newTask).toBeDefined()
    expect((newTask as { data: { status: string, repeatedFromTaskId: string } }).data.status).toBe('active')
    expect((newTask as { data: { repeatedFromTaskId: string } }).data.repeatedFromTaskId).toBe('t-rep')
  })

  it('push task_tag upsert → 关联行落库 + 独立 syncId', async () => {
    // 先建 tag
    await applyPushToPg(USER_ID, {
      mutations: [
        {
          id: 'm-tag',
          entity: 'tag',
          entityId: 'g1',
          op: 'upsert',
          patch: {
            name: '重要',
            color: null,
            createdAt: NOW,
            updatedAt: null,
          },
          clientTs: NOW,
        },
      ],
      commands: [],
      lastSyncId: 0,
    })

    // 建 task_tag
    const res = await applyPushToPg(USER_ID, {
      mutations: [
        {
          id: 'm-tt',
          entity: 'task_tag',
          entityId: 't1|g1',
          op: 'upsert',
          patch: { taskId: 't1', tagId: 'g1' },
          clientTs: NOW,
        },
      ],
      commands: [],
      lastSyncId: 0,
    })

    expect(res.applied).toContain('m-tt')

    const pullRes = await pullFromPg(USER_ID, 0)
    const tt = pullRes.changes.find(r => r.entity === 'task_tag' && r.id === 't1|g1')
    expect(tt).toBeDefined()
    expect((tt as { data: { taskId: string, tagId: string } }).data.taskId).toBe('t1')
    expect((tt as { data: { taskId: string, tagId: string } }).data.tagId).toBe('g1')
  })

  it('push 幂等重发 → 不重复分配 syncId', async () => {
    const r1 = await applyPushToPg(USER_ID, {
      mutations: [
        {
          id: 'm-idem',
          entity: 'task',
          entityId: 't-idem',
          op: 'upsert',
          patch: {
            name: '幂等测试',
            status: 'active',
            flagged: false,
            parentId: null,
            order: 0,
            groupType: null,
            deferDate: null,
            dueDate: null,
            completedAt: null,
            droppedAt: null,
            estimateMinutes: null,
            repeatRuleId: null,
            repeatRule: undefined,
            repeatedFromTaskId: null,
            createdAt: NOW,
            updatedAt: NOW,
            note: null,
          },
          clientTs: NOW,
        },
      ],
      commands: [],
      lastSyncId: 0,
    })

    const clock1 = r1.serverSyncId

    // 重发同 id
    const r2 = await applyPushToPg(USER_ID, {
      mutations: [
        {
          id: 'm-idem',
          entity: 'task',
          entityId: 't-idem',
          op: 'upsert',
          patch: { name: '改名' },
          clientTs: NOW,
        },
      ],
      commands: [],
      lastSyncId: clock1,
    })

    // 幂等：clock 不变，applied 含重放 ack
    expect(r2.serverSyncId).toBe(clock1)
    expect(r2.applied).toContain('m-idem')
    expect(r2.changes).toEqual([])
  })

  it('连续 push clock 递增不双分配 + 两个 task 落库', async () => {
    const UID = `sync-e2e-seq-${Date.now().toString(36)}`
    const { db } = await import('../db/drizzle')
    await db.insert(gtdSyncClocks).values({ userId: UID, clock: 0 })

    // entityId 用 UID 前缀做全局唯一（gtd_tasks.id 是全局 PK，跨 run 复用 'c1' 会撞车 hijack 旧用户行）
    const mkPush = (id: string, name: string) => applyPushToPg(UID, {
      mutations: [{
        id,
        entity: 'task',
        entityId: id,
        op: 'upsert',
        patch: { name, status: 'active', flagged: false, parentId: null, order: 0, groupType: null, deferDate: null, dueDate: null, completedAt: null, droppedAt: null, estimateMinutes: null, repeatRuleId: null, repeatedFromTaskId: null, createdAt: NOW, updatedAt: NOW, note: null },
        clientTs: NOW,
      }],
      commands: [],
      lastSyncId: 0,
    })

    try {
      const r1 = await mkPush(`${UID}-c1`, '任务1')
      const r2 = await mkPush(`${UID}-c2`, '任务2')

      expect(r1.applied).toContain(`${UID}-c1`)
      expect(r2.applied).toContain(`${UID}-c2`)
      expect(r1.serverSyncId).toBe(1)
      expect(r2.serverSyncId).toBe(2)

      const pullRes = await pullFromPg(UID, 0)
      expect(pullRes.changes.filter(r => r.entity === 'task')).toHaveLength(2)
    }
    finally {
      // try/finally：失败也清行，避免泄露行在后续 run 触发全局 id 撞车（单侧 bug 复发）
      await db.delete(gtdTasks).where(eq(gtdTasks.userId, UID))
      await db.delete(gtdSyncClocks).where(eq(gtdSyncClocks.userId, UID))
      await db.delete(gtdSyncMutations).where(eq(gtdSyncMutations.userId, UID))
    }
  })

  // ---------------- Phase 1：mountDirId 权威挂载 + projectId server 派生 ----------------

  it(`mountDirId → server 派生 projectId（project 根 + 子 dir 均回溯根）`, async () => {
    // 建 project 根 + 一级 dir 子节点
    await insertDir({ id: 'dp1', parentId: null, kind: 'project', name: 'P1', projectId: 'dp1', vdir: 'P1', sortOrder: 0 })
    await insertDir({ id: 'dd1', parentId: 'dp1', kind: 'dir', name: 'F1', projectId: 'dp1', vdir: 'P1/F1', sortOrder: 0 })

    // task 挂到 project 根
    await applyPushToPg(USER_ID, {
      mutations: [{
        id: 'm-mount-root',
        entity: 'task',
        entityId: 't-mount-root',
        op: 'upsert',
        patch: taskPatch({ name: '挂到根', mountDirId: 'dp1' }),
        clientTs: NOW,
      }],
      commands: [],
      lastSyncId: 0,
    })
    // task 挂到子 dir
    await applyPushToPg(USER_ID, {
      mutations: [{
        id: 'm-mount-sub',
        entity: 'task',
        entityId: 't-mount-sub',
        op: 'upsert',
        patch: taskPatch({ name: '挂到子目录', mountDirId: 'dd1' }),
        clientTs: NOW,
      }],
      commands: [],
      lastSyncId: 0,
    })

    const pullRes = await pullFromPg(USER_ID, 0)
    const rootTask = pullRes.changes.find(r => r.entity === 'task' && r.id === 't-mount-root') as
      { data: { mountDirId: string | null, projectId: string | null } } | undefined
    const subTask = pullRes.changes.find(r => r.entity === 'task' && r.id === 't-mount-sub') as
      { data: { mountDirId: string | null, projectId: string | null } } | undefined

    // mountDirId 原样落库（权威）；projectId = walkToProjectRoot 派生 = project 根 id
    expect(rootTask?.data.mountDirId).toBe('dp1')
    expect(rootTask?.data.projectId).toBe('dp1')
    expect(subTask?.data.mountDirId).toBe('dd1')
    expect(subTask?.data.projectId).toBe('dp1')
  })

  it(`死 mountDirId（指向不存在 dir）+ 顶层 task → server 修正为 null（Inbox）`, async () => {
    // mountDirId 指向不存在的 dir；parentId=null（顶层）→ stamp 应置 mountDirId=null + projectId=null
    await applyPushToPg(USER_ID, {
      mutations: [{
        id: 'm-dead-mount',
        entity: 'task',
        entityId: 't-dead-mount',
        op: 'upsert',
        patch: taskPatch({ name: '死挂载', mountDirId: 'nonexistent-dir' }),
        clientTs: NOW,
      }],
      commands: [],
      lastSyncId: 0,
    })

    const pullRes = await pullFromPg(USER_ID, 0)
    const task = pullRes.changes.find(r => r.entity === 'task' && r.id === 't-dead-mount') as
      { data: { mountDirId: string | null, projectId: string | null } } | undefined

    expect(task?.data.mountDirId).toBeNull()
    expect(task?.data.projectId).toBeNull()
  })

  it(`projectId 退出 LWW：TaskUpsertPatchSchema omit → patch 含 projectId 被 zod 剥离（不可 push）`, () => {
    // projectId 退出 LWW：schema .omit({projectId:true})，zod 默认 strip 未知键
    const parsed = TaskUpsertPatchSchema.parse({ projectId: 'should-be-stripped', name: '保留' })
    expect('projectId' in parsed).toBe(false)
    expect((parsed as { name: string }).name).toBe('保留')
  })
})
