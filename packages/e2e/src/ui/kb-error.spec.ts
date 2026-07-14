import { execSync } from 'node:child_process'
import process from 'node:process'
import { expect, test } from '@playwright/test'

/**
 * kb agent 出错时的前端交互验证:停 qdrant 后发消息,前端应在对话流内联渲染
 * 可展开错误条(友好标题 + hint + 展开 code/name/details)。
 *
 * 前置:pnpm dev(server 3000 + dev 5173)+ pnpm devops e2e auth(E2E 账号)。
 */

const EMAIL = process.env.E2E_EMAIL ?? 'agent-e2e@cursor.local'
const PASSWORD = process.env.E2E_PASSWORD ?? 'agent-e2e-pass'

/** docker stop/start qdrant(本地 6333),验证 KB_INFRA_DOWN 错误路径 */
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

test.beforeAll(() => {
  // 确保 qdrant 初始在跑(登录/建对话不受影响)
  setQdrant('start')
})

test.afterAll(() => {
  setQdrant('start')
})

test('kb agent 停 qdrant 后前端显示可展开错误条', async ({ page }) => {
  // 抓所有浏览器 console(看 CopilotKit onError 是否触发 + 诊断日志)
  page.on('console', msg => console.log(`[browser:${msg.type()}] ${msg.text()}`))

  // 1. 登录
  await page.goto('/login')
  await page.fill('#email', EMAIL)
  await page.fill('#password', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/$/, { timeout: 15_000 })

  // 2. 新建 kb 对话
  await page.getByText('新建对话').click()
  await page.getByText('知识库 RAG', { exact: false }).click()
  await page.getByRole('button', { name: '创建' }).click()
  // 等对话区出现(CopilotChat textarea 输入框)
  const chatInput = page.locator('textarea').first()
  await expect(chatInput).toBeVisible({ timeout: 15_000 })

  // 3. 停 qdrant 触发 RUN_ERROR
  setQdrant('stop')
  await waitForPort(page, false)

  // 4. 发消息
  const input = page.locator('textarea').or(page.locator('input[placeholder*="输入消息"]')).first()
  await input.fill('你好')
  await input.press('Enter')

  // 5. 对话流内出现错误兜底卡片(情绪安抚文案)
  const card = page.getByText('抱歉，刚才的请求没能处理完成').first()
  await expect(card).toBeVisible({ timeout: 20_000 })

  // 6. 重新生成 + 复制原问题按钮可见
  await expect(page.getByText('重新生成').first()).toBeVisible()
  await expect(page.getByText('复制原问题').first()).toBeVisible()

  // 7. 复制原问题 → 已复制反馈
  await page.getByText('复制原问题').first().click()
  await expect(page.getByText('已复制').first()).toBeVisible()

  // 8. 查看详情展开 code/json
  await page.getByText('查看详情').first().click()
  await expect(page.getByText('KB_INFRA_DOWN').first()).toBeVisible()
  await page.screenshot({ path: 'test-results/error-card-expanded.png' })

  // 9. 重新生成 → 旧卡片消失重跑(再出错再出卡片)
  await page.getByText('重新生成').first().click()
  await page.waitForTimeout(1500)
  await expect(page.getByText('抱歉，刚才的请求没能处理完成').first()).toBeVisible({ timeout: 20_000 })
})

test('已有历史对话发消息出错也显示错误卡片(去重不误判历史 assistant)', async ({ page }) => {
  // 1. 登录 + 新建 kb 对话(qdrant 在跑)
  await page.goto('/login')
  await page.fill('#email', EMAIL)
  await page.fill('#password', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/$/, { timeout: 15_000 })
  await page.getByText('新建对话').click()
  await page.getByText('知识库 RAG', { exact: false }).click()
  await page.getByRole('button', { name: '创建' }).click()
  const chatInput = page.locator('textarea').first()
  await expect(chatInput).toBeVisible({ timeout: 15_000 })

  // 2. 先发一条成功消息产生历史(qdrant 在跑,等 assistant 回复出现)
  await chatInput.fill('怎么开电子发票')
  await chatInput.press('Enter')
  // 等待 assistant 回复出现(知识库 RAG 应返回带"发票"的回复)
  await expect(page.getByText('发票', { exact: false }).first()).toBeVisible({ timeout: 30_000 })

  // 3. 停 qdrant,再发消息 → RUN_ERROR
  setQdrant('stop')
  await waitForPort(page, false)
  const input = page.locator('textarea').first()
  await input.fill('你好')
  await input.press('Enter')

  // 4. 关键断言:已有历史 assistant 回复的情况下,错误卡片仍要出现(不被去重逻辑误判跳过)
  await expect(page.getByText('抱歉，刚才的请求没能处理完成').first()).toBeVisible({ timeout: 20_000 })
  await page.screenshot({ path: 'test-results/error-card-with-history.png' })
})
