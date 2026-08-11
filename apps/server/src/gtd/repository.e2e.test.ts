import type { Tag, Task } from '@agent/gtd'
import { EXPLICIT_STATUS, PLANNED_MODE } from '@agent/gtd'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/drizzle'
import { migrateAppSchema } from '../db/migrate'
import { gtdPerspectives, gtdTasks, gtdTaskTags, tags } from '../db/schema'
import { DrizzleGtdRepository } from './repository'

const USER_ID = `gtd-e2e-${Date.now().toString(36)}`
const NOW = '2026-07-16T12:00:00.000Z'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    name: 'task',
    note: null,
    projectId: null,
    mountDirId: null,
    parentId: null,
    order: 1,
    status: EXPLICIT_STATUS.ACTIVE,
    groupType: null,
    deferDate: null,
    dueDate: null,
    plannedMode: PLANNED_MODE.NONE,
    plannedDate: null,
    completedAt: null,
    droppedAt: null,
    flagged: false,
    estimateMinutes: null,
    repeatRuleId: null,
    tagIds: [],
    attachmentIds: [],
    repeatedFromTaskId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    id: 'tag-1',
    name: 'tag',
    color: null,
    createdAt: NOW,
    updatedAt: null,
    ...overrides,
  }
}

async function cleanup(): Promise<void> {
  await db.delete(gtdTasks).where(eq(gtdTasks.userId, USER_ID))
  await db.delete(gtdPerspectives).where(eq(gtdPerspectives.userId, USER_ID))
  await db.delete(tags).where(eq(tags.userId, USER_ID))
}

describe('drizzleGtdRepository e2e', () => {
  const repo = new DrizzleGtdRepository()

  beforeAll(async () => {
    await migrateAppSchema()
  })

  beforeEach(async () => {
    await cleanup()
  })

  afterAll(async () => {
    await cleanup()
  })

  it('saveTask ↔ getTask 透传 plannedMode/plannedDate', async () => {
    const task = makeTask({
      id: 'task-planned',
      plannedMode: PLANNED_MODE.ON,
      plannedDate: '2026-07-18T00:00:00.000Z',
    })
    await repo.saveTask(USER_ID, task, null)
    const got = await repo.getTask(USER_ID, task.id)
    expect(got?.plannedMode).toBe(PLANNED_MODE.ON)
    expect(got?.plannedDate).toBe('2026-07-18T00:00:00.000Z')
  })

  it('saveTask 同步 gtd_task_tags', async () => {
    const tagA = makeTag({ id: 'tag-a', name: 'tag-a' })
    const tagB = makeTag({ id: 'tag-b', name: 'tag-b' })
    await repo.saveTag(USER_ID, tagA)
    await repo.saveTag(USER_ID, tagB)

    const task = makeTask({ id: 'task-sync', tagIds: [tagA.id] })
    await repo.saveTask(USER_ID, task, null)

    await repo.saveTask(USER_ID, { ...task, tagIds: [tagB.id] }, null)

    const rows = await db
      .select()
      .from(gtdTaskTags)
      .where(eq(gtdTaskTags.taskId, 'task-sync'))
    expect(rows.map(r => r.tagId).sort()).toEqual(['tag-b'])

    const loaded = await repo.getTask(USER_ID, 'task-sync')
    expect(loaded?.tagIds).toEqual(['tag-b'])
  })
})
