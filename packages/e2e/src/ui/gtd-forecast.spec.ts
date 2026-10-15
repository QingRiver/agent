import process from 'node:process'
import { expect, test } from '@playwright/test'
import { e2eFetch, signInE2E } from '../client'

/**
 * GTD Forecast 三段条 e2e：Planned/rolling + 按日块。
 *
 * 验证：默认「现在」含 rolling/due；扩选「过去」见逾期；扩选「以后」见 defer 明日；
 * 侧栏无 Predicted；无预测标签钮。
 *
 * 前置：`pnpm dev` + `pnpm devops e2e auth` + 迁移已应用（含 planned_mode）。
 */

const EMAIL = process.env.E2E_EMAIL ?? 'agent-e2e@cursor.local'
const PASSWORD = process.env.E2E_PASSWORD ?? 'agent-e2e-pass'
const RUN = process.env.GTD_E2E_RUN ?? `fc-${Date.now().toString(36)}`

function startOfLocalToday(): Date {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}
function addLocalDays(dayStart: Date, days: number): Date {
  return new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + days)
}
function iso(d: Date): string {
  return d.toISOString()
}

interface Mutation {
  id: string
  entityId: string
  entity: 'task'
  op: 'upsert' | 'delete'
  patch?: Record<string, unknown>
  clientTs: string
}

async function wipeGtdData(token: string): Promise<void> {
  const pulled = await e2eFetch<{ changes: Array<{ entity: string, id: string }>, serverSyncId: number }>(
    token,
    '/gtd/sync/pull',
    { method: 'POST', body: JSON.stringify({ lastSyncId: 0 }) },
  )
  const ts = new Date().toISOString()
  const deletions: Mutation[] = pulled.changes
    .filter(r => r.entity === 'task' || r.entity === 'task_tag')
    .map((r, i) => ({
      id: `wipe-${RUN}-${i}`,
      entityId: r.id,
      entity: r.entity as 'task',
      op: 'delete' as const,
      clientTs: ts,
    }))
  if (deletions.length) {
    await e2eFetch(token, '/gtd/sync/push', {
      method: 'POST',
      body: JSON.stringify({ mutations: deletions, commands: [], lastSyncId: 0 }),
    })
  }
}

interface CreateTaskCommand {
  id: string
  type: 'create_task'
  taskId: string
  name: string
  parentId: null
  order: number
  mountDirId: null
  clientTs: string
}

test('Forecast 三段条：rolling / 过去 / 以后 defer', async ({ page }) => {
  test.setTimeout(120_000)

  const token = await signInE2E()
  await wipeGtdData(token)
  const now = new Date()
  const startToday = startOfLocalToday()
  const tomorrow = addLocalDays(startToday, 1)
  const ts = iso(now)

  const tOverdue = `${RUN}-overdue`
  const tDueToday = `${RUN}-due`
  const tRolling = `${RUN}-roll`
  const tDeferTomorrow = `${RUN}-defer-tmr`

  const tasks: Array<{ id: string, name: string, order: number, patch: Record<string, unknown> }> = [
    {
      id: tOverdue,
      name: '逾期事A',
      order: 1,
      patch: {
        dueDate: iso(new Date(startToday.getTime() - 60_000)),
      },
    },
    {
      id: tDueToday,
      name: '截止事B',
      order: 2,
      patch: {
        dueDate: iso(new Date(startToday.getTime() + 60_000)),
      },
    },
    {
      id: tRolling,
      name: '滚动事C',
      order: 3,
      patch: { plannedMode: 'rolling' },
    },
    {
      id: tDeferTomorrow,
      name: '推迟明日D',
      order: 4,
      patch: {
        plannedMode: 'rolling',
        deferDate: iso(new Date(tomorrow.getTime() + 60_000)),
      },
    },
  ]
  const commands: CreateTaskCommand[] = tasks.map(task => ({
    id: `${RUN}-c-${task.id}`,
    type: 'create_task',
    taskId: task.id,
    name: task.name,
    parentId: null,
    order: task.order,
    mountDirId: null,
    clientTs: ts,
  }))
  const mutations: Mutation[] = tasks.map(task => ({
    id: `${RUN}-m-${task.id}`,
    entityId: task.id,
    entity: 'task',
    op: 'upsert',
    patch: task.patch,
    clientTs: ts,
  }))

  const pushed = await e2eFetch<{ rejected: Array<{ id: string, reason: string }> }>(token, '/gtd/sync/push', {
    method: 'POST',
    body: JSON.stringify({ mutations, commands, lastSyncId: 0 }),
  })
  expect(pushed.rejected).toEqual([])

  page.on('console', msg => console.log(`[browser:${msg.type()}] ${msg.text()}`))

  await page.goto('/login')
  await page.fill('#email', EMAIL)
  await page.fill('#password', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/$/, { timeout: 15_000 })

  await page.goto('/gtd')
  await page.getByRole('button', { name: '预测' }).click()

  // 三段条默认仅「现在」；可见「以后」
  await expect(page.getByRole('button', { name: '现在' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: '以后' })).toBeVisible()
  await expect(page.getByText('截止事B')).toBeVisible()
  await expect(page.getByText('滚动事C')).toBeVisible()
  await expect(page.getByText('逾期事A')).toHaveCount(0)
  await expect(page.getByText('推迟明日D')).toHaveCount(0)

  // 扩选「过去」：连续段 过去+现在
  await page.getByRole('button', { name: '过去' }).click()
  await expect(page.getByText('过去', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('逾期事A')).toBeVisible()

  // 扩选「以后」：连续 过去..以后；推迟明日出现在以后日块
  await page.getByRole('button', { name: '以后' }).click()
  await expect(page.getByText('推迟明日D')).toBeVisible()
  // rolling 仍只在现在（不复制到以后日）
  await expect(page.getByText('滚动事C')).toBeVisible()

  await expect(page.getByRole('button', { name: '预计' })).toHaveCount(0)
})
