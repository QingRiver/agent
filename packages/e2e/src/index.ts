/**
 * @agent/e2e — E2E 测试统一工具包与场景库。
 *
 * 分层（自底向上，仿 Playwright support/fixtures/tests 分离）：
 *
 *   client/   连接信息 + 认证 fetch（signInE2E / e2eFetch / e2eHeaders / ensureE2eAccount）
 *   support/  flow 共用的机械原语（fail / createThread / drainSse / runAgentRun）
 *   flows/    真实 HTTP/SSE 场景（tags / hitl-agent / kb-agent），由 runFlow 调度
 *   runner.ts CLI 入口：`tsx packages/e2e/src/runner.ts <flow>`（devops skill 调用）
 *
 * 设计：client/support 只做「连接与机械操作」，不含业务断言；
 * 业务断言只存在于对应 flow；HTTP flow 必须通过公开 API，不可直连 service/DB。
 *
 * 前置：`pnpm devops e2e auth` 已写入 E2E 账号（server 的 postgres）。
 */
export * from './client'
export { type E2eFlowName, FLOWS, runFlow } from './flows'
export * from './support'
