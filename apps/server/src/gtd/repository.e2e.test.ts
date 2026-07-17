import type { GtdDocument, Tag, Task } from '@agent/gtd'
import { EXPLICIT_STATUS } from '@agent/gtd'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../db/drizzle'
import { migrateAppSchema } from '../db/migrate'
import { gtdFolders, gtdPerspectives, gtdProjects, gtdTags, gtdTasks, gtdTaskTags } from '../db/schema'
import { DrizzleGtdRepository } from './repository'

const USER_ID = `gtd-e2e-${Date.now().toString(36)}`
const NOW = '2026-07-16T12:00:00.000Z'

function makeDoc(overrides: Partial<GtdDocument> = {}): GtdDocument {
  return {
    version: '1.0.0',
    meta: { createdAt: NOW, updatedAt: NOW, schemaVersion: '1' },
    folders: [],
    projects: [],
    tags: [],
    tasks: [],
    perspectives: [],
    repeatRules: [],
    attachments: [],
    ...overrides,
  }
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    name: 'task',
    note: null,
    projectId: 'proj-1',
    parentId: null,
    order: 1,
    status: EXPLICIT_STATUS.ACTIVE,
    groupType: null,
    deferDate: null,
    dueDate: null,
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
    parentId: null,
    order: 1,
    color: null,
    createdAt: NOW,
    updatedAt: null,
    ...overrides,
  }
}

async function cleanup(): Promise<void> {
  await db.delete(gtdTasks).where(eq(gtdTasks.userId, USER_ID))
  await db.delete(gtdPerspectives).where(eq(gtdPerspectives.userId, USER_ID))
  await db.delete(gtdProjects).where(eq(gtdProjects.userId, USER_ID))
  await db.delete(gtdTags).where(eq(gtdTags.userId, USER_ID))
  await db.delete(gtdFolders).where(eq(gtdFolders.userId, USER_ID))
}

describe('drizzleGtdRepository e2e', () => {
  const repo = new DrizzleGtdRepository()

  beforeAll(async () => {
    await migrateAppSchema()
    await cleanup()
  })

  afterAll(async () => {
    await cleanup()
  })

  it('saveDocument ↔ loadDocument round-trip', async () => {
    const tag = makeTag()
    const task = makeTask({ tagIds: [tag.id] })
    const doc = makeDoc({
      tags: [tag],
      projects: [{
        id: 'proj-1',
        name: 'project',
        note: null,
        folderId: null,
        order: 1,
        status: EXPLICIT_STATUS.ACTIVE,
        type: 'parallel',
        defaultDeferOffset: null,
        defaultDueOffset: null,
        defaultTagIds: [],
        flagged: false,
        review: {
          enabled: true,
          interval: 'weekly',
          customDays: null,
          lastReviewDate: null,
          nextReviewDate: NOW,
          needsReview: false,
        },
        createdAt: NOW,
        updatedAt: NOW,
      }],
      tasks: [task],
    })

    await repo.saveDocument(USER_ID, doc)
    const loaded = await repo.loadDocument(USER_ID)

    expect(loaded.tasks).toHaveLength(1)
    expect(loaded.tasks[0]?.tagIds).toEqual([tag.id])
    expect(loaded.meta.createdAt).toBe(NOW)
    const updatedMs = new Date(loaded.meta.updatedAt).getTime()
    expect(updatedMs).toBeGreaterThanOrEqual(new Date(NOW).getTime())
  })

  it('saveTask 同步 gtd_task_tags', async () => {
    const tagA = makeTag({ id: 'tag-a' })
    const tagB = makeTag({ id: 'tag-b', name: 'tag-b' })
    const task = makeTask({ id: 'task-sync', tagIds: [tagA.id] })
    const doc = makeDoc({
      tags: [tagA, tagB],
      projects: [{
        id: 'proj-1',
        name: 'project',
        note: null,
        folderId: null,
        order: 1,
        status: EXPLICIT_STATUS.ACTIVE,
        type: 'parallel',
        defaultDeferOffset: null,
        defaultDueOffset: null,
        defaultTagIds: [],
        flagged: false,
        review: {
          enabled: true,
          interval: 'weekly',
          customDays: null,
          lastReviewDate: null,
          nextReviewDate: NOW,
          needsReview: false,
        },
        createdAt: NOW,
        updatedAt: NOW,
      }],
      tasks: [task],
    })
    await repo.saveDocument(USER_ID, doc)

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
