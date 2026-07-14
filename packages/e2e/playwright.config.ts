import process from 'node:process'
import { defineConfig } from '@playwright/test'

/**
 * Playwright 配置:驱动真实浏览器验证 AG-UI 前端交互(错误条是否渲染、能否展开)。
 *
 * 前置:server(pnpm dev,3000)+ dev(5173)+ e2e 账号(pnpm devops e2e auth)。
 * 自签证书用 ignoreHTTPSErrors 放行。
 */
export default defineConfig({
  testDir: './src/ui',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.BASE_URL ?? 'https://localhost:5173',
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 900 },
    actionTimeout: 15_000,
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  // 不自动启动 server:复用已在跑的 pnpm dev(避免 devops skill 与 playwright 各起一套)
  webServer: process.env.CI
    ? {
        command: 'pnpm dev',
        port: 5173,
        timeout: 120_000,
        reuseExistingServer: true,
      }
    : undefined,
})
