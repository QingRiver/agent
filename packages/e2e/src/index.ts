/**
 * @agent/e2e — E2E 测试统一工具包与场景库。
 *
 * 分层（自底向上，仿 Playwright support/fixtures/tests 分离）：
 *
 *   client/   连接信息 + 认证 fetch（signInE2E / e2eFetch / e2eHeaders / ensureE2eAccount）
 *   support/  flow 共用的机械原语（fail / createThread / drainSse / runAgentRun）
 *   flows/    各 agent 的端到端场景（hitl-agent / kb-agent），注册于 FLOWS，由 runFlow 调度
 *   runner.ts CLI 入口：`tsx packages/e2e/src/runner.ts <flow>`（devops skill 调用）
 *
 * 设计：client/support 只做「连接与机械操作」，不含业务断言；
 * 业务断言（4 步 interrupt 序列、最终回复含「已批准执行」等）只存在于对应 flow。
 * 新增 agent flow 只动 flows/，不影响 client/support 与 skill。
 *
 * 前置：`pnpm devops e2e auth` 已写入 E2E 账号（server 的 postgres）。
 */
export * from './client'
export { type E2eFlowName, FLOWS, runFlow } from './flows'
export * from './support'
