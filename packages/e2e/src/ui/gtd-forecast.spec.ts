import type { Op } from '@agent/gtd'
import type { Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { expect, test } from '@playwright/test'
import { GtdDevice, signInE2E } from '../client'

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

function createTask(taskId: string, name: string, order: number, ts: string): Op {
  return {
    kind: 'create',
    id: randomUUID(),
    clientTs: ts,
    taskId,
    name,
    parentId: null,
    order,
    mountDirId: null,
  }
}

function patchTask(taskId: string, patch: Record<string, unknown>, ts: string): Op {
  return {
    kind: 'patch',
    id: randomUUID(),
    clientTs: ts,
    entity: 'task',
    entityId: taskId,
    patch,
  }
}

/** 本次创建的任务：移进回收站再永久删除。 */
async function removeTasks(device: GtdDevice, taskIds: string[]): Promise<void> {
  const ts = new Date().toISOString()
  await device.act(taskIds.flatMap((taskId): Op[] => [
    { kind: 'transition', id: randomUUID(), clientTs: ts, action: 'delete', taskId },
    { kind: 'purge', taskId },
  ]))
}

test('Forecast 三段条：rolling / 过去 / 以后 defer', async ({ page }) => {
  test.setTimeout(120_000)

  const token = await signInE2E()
  const device = new GtdDevice(token)
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
      name: `逾期事A-${RUN}`,
      order: 1,
      patch: {
        dueDate: iso(new Date(startToday.getTime() - 60_000)),
      },
    },
    {
      id: tDueToday,
      name: `截止事B-${RUN}`,
      order: 2,
      patch: {
        dueDate: iso(new Date(startToday.getTime() + 60_000)),
      },
    },
    {
      id: tRolling,
      name: `滚动事C-${RUN}`,
      order: 3,
      patch: { plannedMode: 'rolling' },
    },
    {
      id: tDeferTomorrow,
      name: `推迟明日D-${RUN}`,
      order: 4,
      patch: {
        plannedMode: 'rolling',
        deferDate: iso(new Date(tomorrow.getTime() + 60_000)),
      },
    },
  ]
  await device.act(tasks.flatMap(task => [
    createTask(task.id, task.name, task.order, ts),
    patchTask(task.id, task.patch, ts),
  ]))

  try {
    await checkForecast(page)
  }
  finally {
    await removeTasks(device, tasks.map(t => t.id))
  }
})

async function checkForecast(page: Page): Promise<void> {
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
  await expect(page.getByText(`截止事B-${RUN}`)).toBeVisible()
  await expect(page.getByText(`滚动事C-${RUN}`)).toBeVisible()
  await expect(page.getByText(`逾期事A-${RUN}`)).toHaveCount(0)
  await expect(page.getByText(`推迟明日D-${RUN}`)).toHaveCount(0)

  // 扩选「过去」：连续段 过去+现在
  await page.getByRole('button', { name: '过去' }).click()
  await expect(page.getByText('过去', { exact: true }).first()).toBeVisible()
  await expect(page.getByText(`逾期事A-${RUN}`)).toBeVisible()

  // 扩选「以后」：连续 过去..以后；推迟明日出现在以后日块
  await page.getByRole('button', { name: '以后' }).click()
  await expect(page.getByText(`推迟明日D-${RUN}`)).toBeVisible()
  // rolling 仍只在现在（不复制到以后日）
  await expect(page.getByText(`滚动事C-${RUN}`)).toBeVisible()

  await expect(page.getByRole('button', { name: '预计' })).toHaveCount(0)
}
