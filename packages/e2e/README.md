# @agent/e2e

E2E 测试统一工具包与场景库。真实 HTTP/SSE 流程都放在本包；`apps/server` 的 Vitest 只算进程内集成测试，不算 HTTP E2E。

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
  flows/        场景层：真实 HTTP/SSE 端到端 flow（业务断言在此）
    hitl-agent.ts 4 步 interrupt + resume，校验「已批准执行」
    kb-agent.ts   单轮 RAG，echo SSE
    tags.ts       KB + GTD + shared tags CRUD/删除全流程
    index.ts      FLOWS 注册表 + runFlow(name)
  ui/          Playwright 浏览器层：驱动真实前端 UI 验证 AG-UI 交互（错误条渲染/展开等）
    kb-error.spec.ts  停 qdrant 后断言可展开错误条出现
  runner.ts     CLI 入口：tsx src/runner.ts <flow>
  index.ts      公共导出
  playwright.config.ts  Playwright 配置（ignoreHTTPSErrors 放行自签证书，复用已在跑的 pnpm dev）
```

**职责边界**：`client` 只管认证与 HTTP 连接，`support` 只管机械操作，`flows` 通过真实 server API/SSE 完成业务场景与断言，`ui` 驱动真实浏览器。失败由 runner 统一转为退出码 1，flow 用 `finally` 清理测试资源。

## 前置

- server 已启动：`pnpm dev`
- E2E 账号已写入（server postgres）：`pnpm devops e2e auth`
- shared tags flow 不依赖 seed：自行创建并经 API 清理文档、GTD、标签
- 知识库 flow 另需：`pnpm devops infra up kb` + `pnpm devops e2e seed`
- 清空某用户知识库后重导入：`pnpm devops e2e clear-kb --email <addr>`（需 postgres + qdrant）

## 运行

经 devops（推荐，会自动指向 dev server）：

```bash
pnpm e2e                         # seed 后运行下列全部 E2E
pnpm devops e2e hitl-agent
pnpm devops e2e agent          # kb agent SSE
pnpm devops e2e tags           # shared tags 真实 HTTP 全流程
pnpm devops e2e ui             # playwright 前端 UI（停 qdrant 验证错误条）
pnpm devops e2e clear-kb --email you@example.com
```

`pnpm e2e` 的 `all` 不划分测试范围：依次执行 KB pipeline、shared tags HTTP、HITL graph、KB agent SSE、HITL agent SSE 和 Playwright UI。需提前启动测试 infra 与 `pnpm dev`。

直接调 runner：

```bash
pnpm exec tsx packages/e2e/src/runner.ts hitl-agent
pnpm exec tsx packages/e2e/src/runner.ts kb-agent
pnpm exec tsx packages/e2e/src/runner.ts tags
```

退出码 0 通过 / 1 失败（CI 据此判定）。

### `tags` flow 覆盖

1. 通过 `/tags/create` 新建公共标签
2. 通过 `/kb/documents/create` 新建两篇文档并绑定 `tagIds`
3. 通过 `/gtd/sync/push` 新建两个 task + `task_tag`
4. `untag`：dryRun 返回文档/GTD 列表；执行后资源保留、绑定消失
5. `delete_entities` 部分删除：选中一篇文档和一个 task 删除，其余资源保留并解绑
6. `delete_entities` 全部删除：使用 dryRun 返回的完整列表删除全部关联资源
7. 通过 KB get、GTD pull、tags list 真实读接口验证结果

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

## 相关文档

- 仓库根 [README](../../README.md)
- [`.cursor/skills/devops/SKILL.md`](../../.cursor/skills/devops/SKILL.md) — `pnpm devops` 统一入口
- [apps/server/README.md](../../apps/server/README.md)
- [apps/client/README.md](../../apps/client/README.md)
