import type { EntityRowOf, Op } from '@agent/gtd'
import { randomUUID } from 'node:crypto'
import { EXPLICIT_STATUS } from '@agent/gtd'
import { like } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../db/drizzle'
import { gtdRows } from '../db/schema'
import { applyGtd, applyGtdOps, hasTasksMountedIn, listGtd, tasksTaggedWith } from '../service/gtd'

const PREFIX = `gtd-e2e-${randomUUID().slice(0, 8)}`
const NOW = new Date().toISOString()

async function wipe(): Promise<void> {
  await db.delete(gtdRows).where(like(gtdRows.userId, `${PREFIX}%`))
}

function uid(suffix: string): string {
  return `${PREFIX}-${suffix}`
}

function create(taskId: string, name: string, mountDirId: string | null = null): Op {
  return {
    kind: 'create',
    id: randomUUID(),
    clientTs: NOW,
    taskId,
    name,
    parentId: null,
    order: 0,
    mountDirId,
  }
}

function complete(taskId: string): Op {
  return { kind: 'transition', id: randomUUID(), clientTs: NOW, action: 'complete', taskId }
}

function trash(taskId: string): Op {
  return { kind: 'transition', id: randomUUID(), clientTs: NOW, action: 'delete', taskId }
}

describe('gtd list/apply e2e', () => {
  beforeAll(async () => {
    await wipe()
  })

  afterAll(async () => {
    await wipe()
  })

  it('apply 创建任务，list 能读到', async () => {
    const userId = uid('a')
    await applyGtd(userId, { ops: [create('t1', 'hello')] })
    const { rows } = await listGtd(userId)
    const row = rows.find((r): r is EntityRowOf<'task'> => r.entity === 'task' && r.id === 't1')
    expect(row?.data.name).toBe('hello')
  })

  it('非法意图被拒绝', async () => {
    const userId = uid('b')
    await expect(applyGtd(userId, {
      ops: [{ kind: 'purge', taskId: 'missing' }],
    })).rejects.toThrow()
  })

  it('永久删除后行消失', async () => {
    const userId = uid('c')
    await applyGtd(userId, { ops: [create('t1', 'x')] })
    await applyGtd(userId, {
      ops: [trash('t1'), { kind: 'purge', taskId: 't1' }],
    })
    const { rows } = await listGtd(userId)
    expect(rows.find(r => r.id === 't1')).toBeUndefined()
  })

  it('applyGtdOps 可在事务内解绑标签', async () => {
    const userId = uid('d')
    await applyGtd(userId, {
      ops: [
        create('t1', 'tagged'),
        {
          kind: 'patch',
          id: randomUUID(),
          clientTs: NOW,
          entity: 'task_tag',
          entityId: 't1|g1',
          patch: { taskId: 't1', tagId: 'g1' },
        },
      ],
    })
    expect(await tasksTaggedWith(db, userId, 'g1')).toHaveLength(1)

    await db.transaction(async (tx) => {
      await applyGtdOps(tx, userId, rows => rows
        .filter(r => r.entity === 'task_tag' && r.data.tagId === 'g1')
        .map(r => ({
          kind: 'delete' as const,
          id: randomUUID(),
          clientTs: NOW,
          entity: 'task_tag' as const,
          entityId: r.id,
        })))
    })
    expect(await tasksTaggedWith(db, userId, 'g1')).toHaveLength(0)
  })

  it('hasTasksMountedIn 只认根任务挂载', async () => {
    const userId = uid('e')
    await applyGtd(userId, {
      ops: [
        create('root', 'root', 'dir-root'),
        {
          kind: 'patch',
          id: randomUUID(),
          clientTs: NOW,
          entity: 'task',
          entityId: 'root',
          patch: { groupType: 'parallel' },
        },
        {
          kind: 'create',
          id: randomUUID(),
          clientTs: NOW,
          taskId: 'child',
          name: 'child',
          parentId: 'root',
          order: 0,
          mountDirId: 'dir-other',
        },
      ],
    })
    expect(await hasTasksMountedIn(db, userId, ['dir-root'])).toBe(true)
    expect(await hasTasksMountedIn(db, userId, ['dir-other'])).toBe(false)
  })

  it('完成任务更新 status', async () => {
    const userId = uid('f')
    await applyGtd(userId, { ops: [create('t1', 'todo')] })
    await applyGtd(userId, { ops: [complete('t1')] })
    const { rows } = await listGtd(userId)
    const row = rows.find((r): r is EntityRowOf<'task'> => r.entity === 'task' && r.id === 't1')
    expect(row?.data.status).toBe(EXPLICIT_STATUS.COMPLETED)
  })
})
