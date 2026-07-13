import process from 'node:process'

/**
 * E2E 运行配置（环境变量可覆盖）。
 *
 * 约定：E2E 账号由 `pnpm devops e2e auth` 写入 server 的 postgres；
 * 此处仅持有「连哪个 server、用哪个账号」的连接信息，不含建号逻辑。
 */

/** E2E 测试账号（pnpm devops e2e auth 写入） */
export const E2E_ACCOUNT = {
  email: process.env.E2E_EMAIL ?? 'agent-e2e@cursor.local',
  password: process.env.E2E_PASSWORD ?? 'agent-e2e-pass',
} as const

/** server 基址（dev：https://localhost:3000） */
export const E2E_BASE_URL = process.env.BASE_URL ?? 'https://localhost:3000'

/** dev 前端 Origin（CORS / better-auth trustedOrigins） */
export const E2E_DEV_ORIGIN = process.env.DEV_ORIGIN ?? 'https://localhost:5173'

/** 可覆盖 base 地址的选项（供多环境/CI 临时指向别的 server） */
export interface E2EOptions {
  baseUrl?: string
}

let tlsBypassConfigured = false

/**
 * 自签证书旁路（dev server 用 mkcert 自签证书，CI/测试环境需放行）。
 * 幂等：进程内只设一次。所有客户端函数会自动调用，调用方通常无需手动调。
 */
export function configureE2ETls(): void {
  if (tlsBypassConfigured)
    return
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  tlsBypassConfigured = true
}
