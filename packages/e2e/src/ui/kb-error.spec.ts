import { execSync } from 'node:child_process'
import process from 'node:process'
import { expect, test } from '@playwright/test'

/**
 * kb 图在 qdrant 不可用时，聊天窗走 POST /graphs/kb/stream，SSE 里应有 event: "error"。
 * 已有回复不应被这一轮错误清掉。
 *
 * 前置：pnpm dev（server 3000 + dev 5173）+ pnpm devops e2e auth。
 */

const EMAIL = process.env.E2E_EMAIL ?? 'agent-e2e@cursor.local'
const PASSWORD = process.env.E2E_PASSWORD ?? 'agent-e2e-pass'

/** docker stop/start qdrant（本地 6333） */
function setQdrant(state: 'start' | 'stop'): void {
  execSync(`docker ${state} qdrant`, { stdio: 'ignore' })
}

/** 等端口可达/不可达 */
async function waitForPort(page: import('@playwright/test').Page, up: boolean): Promise<void> {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await page.request.get('http://localhost:6333/healthz', { timeout: 1000 })
      if (up && res.ok())
        return
    }
    catch {
      if (!up)
        return
    }
    await new Promise(r => setTimeout(r, 500))
  }
}

async function loginAndOpenKbChat(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login')
  await page.fill('#email', EMAIL)
  await page.fill('#password', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/$/, { timeout: 15_000 })
  await page.goto('/chat')
  await page.getByRole('button', { name: '新建对话' }).click()
  await page.getByText('知识库 RAG', { exact: false }).click()
  await page.getByRole('button', { name: '创建' }).click()
  await expect(page.locator('textarea').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: '发送' })).toBeVisible({ timeout: 15_000 })
}

/** 点发送，读尽 /graphs/kb/stream 的 SSE 正文。 */
async function sendAndReadStream(page: import('@playwright/test').Page, text: string): Promise<string> {
  const input = page.locator('textarea').first()
  await input.click()
  await input.fill(text)
  const runWait = page.waitForResponse(
    r => r.url().includes('/graphs/kb/stream') && r.request().method() === 'POST',
    { timeout: 30_000 },
  )
  await page.getByRole('button', { name: '发送' }).click()
  const res = await runWait
  return await res.text()
}

test.beforeAll(() => {
  setQdrant('start')
})

test.afterAll(() => {
  setQdrant('start')
})

test('kb 停 qdrant 后 /graphs/kb/stream 返回 error', async ({ page }) => {
  page.on('console', msg => console.log(`[browser:${msg.type()}] ${msg.text()}`))
  await loginAndOpenKbChat(page)

  setQdrant('stop')
  await waitForPort(page, false)

  const body = await sendAndReadStream(page, '你好')
  expect(body).toContain('"event":"error"')
})

test('已有回复后再出错，历史正文仍在，本轮 stream 为 error', async ({ page }) => {
  setQdrant('start')
  await waitForPort(page, true)
  await loginAndOpenKbChat(page)

  await sendAndReadStream(page, '怎么开电子发票')
  await expect(page.getByText('发票', { exact: false }).first()).toBeVisible({ timeout: 30_000 })

  setQdrant('stop')
  await waitForPort(page, false)
  const body = await sendAndReadStream(page, '你好')
  expect(body).toContain('"event":"error"')
  await expect(page.getByText('发票', { exact: false }).first()).toBeVisible()
})
