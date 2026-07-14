# @agent/e2e

E2E 测试统一工具包与场景库。按 Playwright `support / fixtures / tests` 的分离惯例分层，让「连接、机械操作、业务断言」各归其位。

## 分层

```
src/
  client/       连接层：连哪个 server、用什么账号、认证 fetch
    config.ts     E2E_ACCOUNT / E2E_BASE_URL / E2E_DEV_ORIGIN / configureE2ETls()
    auth.ts       signInE2E / e2eFetch / e2eHeaders / ensureE2eAccount
  support/      共用原语：跨 flow 复用的机械操作（无业务断言）
    assert.ts     fail() — 断言失败即 exit 1
    thread.ts     createThread(token, agentId)
    sse.ts        drainSse() + runAgentRun() — 统一 SSE 读流 + RUN_ERROR 兜底
  flows/        场景层：各 agent 的端到端 flow（业务断言在此）
    hitl-agent.ts 4 步 interrupt + resume，校验「已批准执行」
    kb-agent.ts   单轮 RAG，echo SSE
    index.ts      FLOWS 注册表 + runFlow(name)
  ui/          Playwright 浏览器层：驱动真实前端 UI 验证 AG-UI 交互（错误条渲染/展开等）
    kb-error.spec.ts  停 qdrant 后断言可展开错误条出现
  runner.ts     CLI 入口：tsx src/runner.ts <flow>
  index.ts      公共导出
  playwright.config.ts  Playwright 配置（ignoreHTTPSErrors 放行自签证书，复用已在跑的 pnpm dev）
```

**职责边界**：`client` 只管连接，`support` 只管机械操作（建会话/读流/断言退出），`flows` 只管 SSE 原始流断言，`ui` 驱动真实浏览器验证前端交互。新增 agent flow 只动 `flows/`，新增 UI 断言只动 `ui/`，互不影响。

## 前置

- server 已启动：`pnpm dev`
- E2E 账号已写入（server postgres）：`pnpm devops e2e auth`
- 知识库 flow 另需：`pnpm devops infra up kb` + `pnpm devops e2e seed`

## 运行

经 devops（推荐，会自动指向 dev server）：

```bash
pnpm devops e2e hitl-agent
pnpm devops e2e agent          # kb agent SSE
pnpm devops e2e ui             # playwright 前端 UI（停 qdrant 验证错误条）
```

直接调 runner：

```bash
pnpm exec tsx packages/e2e/src/runner.ts hitl-agent
pnpm exec tsx packages/e2e/src/runner.ts kb-agent
```

退出码 0 通过 / 1 失败（CI 据此判定）。

## 作为客户端复用（其他服务）

不经 flow、仅复用连接层：

```ts
import { signInE2E, e2eFetch } from '@agent/e2e'

const token = await signInE2E()
const data = await e2eFetch(token, '/conversations/list')
```

SSE 原始流：

```ts
import { signInE2E, e2eHeaders, E2E_BASE_URL } from '@agent/e2e'
const token = await signInE2E()
await fetch(`${E2E_BASE_URL}/copilotkit/agent/hitl/run`, {
  method: 'POST',
  headers: e2eHeaders(token, { Accept: 'text/event-stream', 'Content-Type': 'application/json' }),
  body: JSON.stringify({ threadId, runId, /* ... */ }),
})
```

## 配置（环境变量，均可覆盖）

| 变量 | 默认 | 说明 |
|------|------|------|
| `E2E_EMAIL` / `E2E_PASSWORD` | `agent-e2e@cursor.local` / `agent-e2e-pass` | E2E 账号 |
| `BASE_URL` | `https://localhost:3000` | server 基址 |
| `DEV_ORIGIN` | `https://localhost:5173` | 前端 Origin（CORS / trustedOrigins） |
| `HITL_INPUT` | `向账户 0x123 转账 100 ETH` | hitl flow 输入 |
| `KB_ID` / `QUESTION` | `kb_default` / `怎么开电子发票` | kb flow 参数 |
