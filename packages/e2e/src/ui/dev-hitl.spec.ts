import process from 'node:process'
import { expect, test } from '@playwright/test'

/**
 * dev agent HITL：Playwright 真实点击澄清 → input → select → multiSelect → approval。
 *
 * 与 `flows/hitl-agent.ts`（SSE）对齐；本文件走浏览器 @agent/ui InterruptCard。
 * 前置：`pnpm dev` + `pnpm devops e2e auth`。
 */

const EMAIL = process.env.E2E_EMAIL ?? 'agent-e2e@cursor.local'
const PASSWORD = process.env.E2E_PASSWORD ?? 'agent-e2e-pass'
const USER_INPUT = process.env.HITL_INPUT ?? '向账户 0x123 转账 100 ETH'
const PURPOSE = '季度资金归集'

test('dev HITL：浏览器完成 4 步中断并批准执行', async ({ page }) => {
  test.setTimeout(120_000)
  page.on('console', msg => console.log(`[browser:${msg.type()}] ${msg.text()}`))

  await page.goto('/login')
  await page.fill('#email', EMAIL)
  await page.fill('#password', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/$/, { timeout: 15_000 })

  await page.getByText('新建对话').click()
  await page.getByText('开发演示', { exact: false }).click()
  await page.getByRole('button', { name: '创建' }).click()

  const chatInput = page.locator('textarea').first()
  await expect(chatInput).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('copilot-send-button')).toBeVisible({ timeout: 15_000 })

  // 受控 textarea：fill 后点发送（比 Enter 更稳，避免 React value 未同步）
  await chatInput.click()
  await chatInput.fill(USER_INPUT)
  const runWait = page.waitForResponse(
    r => r.url().includes('/copilotkit/agent/dev/run') && r.request().method() === 'POST',
    { timeout: 30_000 },
  )
  await page.getByTestId('copilot-send-button').click()
  await runWait

  // 澄清：选 HITL 审批演示
  await expect(page.getByText('请选择本次要演示的能力')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('HITL 审批演示', { exact: false })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: /HITL 审批演示/ }).click()

  // input
  await expect(page.getByText('请简要描述本次操作目的')).toBeVisible({ timeout: 20_000 })
  await page.locator('input[placeholder*="整理季度报表"]').fill(PURPOSE)
  await page.getByRole('button', { name: '提交' }).click()

  // select 优先级 → 高
  await expect(page.getByText('请选择优先级')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: /^高/ }).click()

  // multiSelect
  await expect(page.getByText('请选择附加选项')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: /记录审计日志/ }).click()
  await page.getByRole('button', { name: /发送通知/ }).click()
  await page.getByRole('button', { name: '确认选择' }).click()

  // approval
  await expect(page.getByText('请确认是否执行以下操作')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(PURPOSE)).toBeVisible()
  await page.getByRole('button', { name: '批准' }).click()

  await expect(page.getByText('已批准执行', { exact: false })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(PURPOSE, { exact: false }).first()).toBeVisible()
  await page.screenshot({ path: 'test-results/dev-hitl-approved.png' })
})
