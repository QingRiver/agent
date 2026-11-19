# Gateway 别扭实现与优化备忘

扫读 `apps/server/gateway` 后整理：哪里实现别扭、为什么别扭、建议怎么改。  
**不是立刻开工的任务清单**；按优先级挑着做。Agent / 图接入相关优先。

---

## 总览（优先级）

| 优先级 | 区域 | 别扭点 | 建议方向 |
|--------|------|--------|----------|
| P0 | `graphAgents` 类型 | `as unknown as CompiledGraphApp` 手工窄化 | 用官方 `CompiledStateGraph` / 包一层薄适配类型 |
| P0 | 图元数据散落 | 描述、默认文案、`resolveGraphInput/RunOptions` 按 name 分支 | 每图注册表（catalog + input/run hooks） |
| P1 | SSE + HTTP/2 | 删 `transfer-encoding`/`connection` 头 | 抽 `streamGraphSse()`；跟进 hono 是否修好 |
| P1 | AgentConfig 双 schema | `Upsert…` 与 `ReactAgentRuntimeConfigSchema` 字段重复 | 以 graph 侧 schema 为源，HTTP schema extend |
| P2 | Handler 样板 | static class + 重复 DTO 映射 | 薄函数 / 统一 `toDto` |
| P2 | Service 巨石 | `kb.ts` ~1k、`skill.ts` ~666 行 | 按用例拆文件 |
| P3 | 错误模型 | 有的 403 boolean，有的 throw HTTPException | 统一 `requireOwned` / AppError |
| P3 | 模块副作用 | `setSkillFileLoader` 在 import 时执行 | 挪到 `bootstrap` |

---

## 1. 图编译与类型（P0）

### 现状

```ts
// graphAgents.ts
const compiled = Graphs[name].compile({ checkpointer }) as unknown as CompiledGraphApp

// threadState.ts
getGraphApp(name) as unknown as CompiledStateGraph<unknown, unknown>
```

自建 `CompiledGraphApp` 只暴露 `stream` / `getState`，和 LangGraph 真实类型脱节，两处双重断言。

### 为什么别扭

- 丢类型安全；`streamMode`、`recursionLimit` 等只能手抄
- 同一编译结果被两套「假装类型」消费

### 优化

1. `getGraphApp` 返回 `ReturnType<typeof Graphs[GraphsName]['compile']>`（或 `CompiledStateGraph`）
2. 删掉自建 `CompiledGraphApp`；`threadState` 直接用同一类型
3. 若泛型太吵，保留 **一个** 内部别名，禁止 `as unknown as` 链

---

## 2. 按图名的特殊分支（P0）

### 现状

`graphAgents.ts` 里：

- `GRAPH_DESCRIPTIONS` / `DEFAULT_USER_TEXT`：两份 `Record<GraphsName, …>`
- `resolveGraphInput`：`editor` 空消息、`dev` 多写 `input`
- `resolveGraphRunOptions`：`reactAgent` / `kb` 特判，其余透传

每加一张图要改多处，且易漏 catalog。

### 优化

引入注册表，例如：

```ts
type GraphRegistration = {
  description: string
  defaultUserText: string
  buildInput: (req: GraphInvokeRequest) => unknown
  resolveRun?: (userId, configurable) => Promise<RunOptions>
}

const registry: Record<GraphsName, GraphRegistration> = { … }
```

- `listGraphAgentCatalog` / `resolveGraphInput` / `resolveGraphRunOptions` 只读表
- `dev` 的 `{ input, messages }`、`reactAgent` 的 config 解析都挂在对应 entry 上

---

## 3. SSE 流与 HTTP/2（P1）

### 现状

`graphStream.ts`：

1. `streamSSE` 写出后 **手动 delete** `transfer-encoding` / `connection`（否则 HTTP/2 打崩进程）
2. `for await` + `projectLangGraphChunk` + `JSON.stringify` 全堆在 handler
3. 错误只 `console.error` 再写一条 SSE `error` 事件

### 为什么别扭

- 协议 workaround 和业务编排耦在一起
- 注释已说明原因，但无可测的独立单元

### 优化

1. 抽 `createGraphSseResponse(c, write)`：内部统一删禁头
2. 抽 `iterateGraphWireEvents(graph, input, opts)`：yield 已投影事件，handler 只负责写 SSE
3. 关注 `@hono/node-server` / `streamSSE` 是否已修 HTTP/2；修好后删 workaround 并留回归测试

---

## 4. AgentConfig：双份校验与内存缓存（P1）

### 现状

- HTTP：`shared/agentConfig.ts` 的 `UpsertAgentConfigRequestSchema`（含 name/description/skillCodes）
- 运行时：`@agent/graph` 的 `ReactAgentRuntimeConfigSchema` + `sanitize*` / `clampMaxSteps`
- `store.ts` upsert 时再 `toRuntime` 一遍；handler 里 upsert/get **手写两份相同 JSON 字段**

进程内 `Map` 缓存配置，多实例会脏读（单机 dev 可接受）。

### 优化

1. `UpsertAgentConfigRequestSchema = ReactAgentRuntimeConfigSchema.extend({ name, description, skillCodes, id? })`
2. `AgentConfigHandlers` 共用 `toAgentConfigDto(record)`
3. 缓存：文档标明「单进程」；若上多实例，改为不缓存或短 TTL + 写后失效（已有 `invalidate`）

---

## 5. Handler 层样板（P2）

### 现状

普遍 `export class XxxHandlers { static async … }`，多数只是：

`鉴权用户 → service → c.json`

例如 `GtdSyncHandlers` 一行转发；`AgentConfigHandlers` 两处复制 DTO；`ConversationHandlers` pin/unpin 几乎相同。

### 为什么别扭

- class + static 无实例状态，只是命名空间
- 与 Hono 推荐的「路由里直接 async (c) =>」比，多跳一层且类型要反复传 `Context`

### 优化

- 可改为 `export async function upsertAgentConfig(c, …)` 或路由内联薄逻辑
- 重复响应形状抽 `dto.ts`
- 不是必须改；新代码优先函数式即可

---

## 6. Service 巨石文件（P2）

| 文件 | 约行数 | 问题 |
|------|--------|------|
| `service/kb.ts` | ~1000 | ingest / list / tags / 权限缠在一起 |
| `service/skill.ts` | ~666 | 版本、文件树、冲突 |
| `service/tags.ts` | ~418 | |
| `service/project.ts` | ~396 | |

### 优化

按 **用例** 拆（例：`kb/ingest.ts`、`kb/documents.ts`、`kb/acl.ts`），`service/kb/index.ts` 再导出。  
先拆 kb：对 gateway 体积和评审成本收益最大。

---

## 7. 错误与所有权模型不一致（P3）

### 现状

| 路径 | 行为 |
|------|------|
| 图 stream/state | `assertThreadOwnedByUser` → **boolean** → handler 手写 403 |
| project/kb/tags | `requireOwned` → **throw** 404（故意隐身） |
| conversation detail | service 返回 null → handler 404 |
| `resolveReactAgentRun` | **throw Error** 字符串，靠 `onError` 变 500 |

图线程「无权限」用 403；资源「非所有者」用 404。语义可以保留，但入口应统一。

### 优化

1. `assertThreadOwnedByUser` 改为 `requireThreadOwned`（失败 throw HTTPException），与 `requireOwned` 对称
2. AgentConfig 缺失用 `HTTPException(404)`，避免裸 `Error` → 500
3. `handleAppError` 可识别少量领域错误码（可选）

---

## 8. 模块加载副作用（P3）

### 现状

`graphAgents.ts` 顶层：

```ts
setSkillFileLoader(async ({ userId, skillCode }) => SkillService.walkFiles(…))
```

任意 import `graphAgents`（含测试、catalog）都会绑 loader。

### 优化

挪到 `bootstrapDatabases()` 之后 / `startServer()` 之前显式 `initGraphRuntime()`，测试可注入 mock loader。

---

## 9. 其它小点（顺手）

- **`threadGuard.ts`**：一层 boolean 转发，可内联或并入 `ConversationService.assertOwned`
- **全局 session 中间件**（`index.ts`）：所有请求打 auth；可对健康检查/静态资源排除（若已有 public 静态则注意顺序）
- **`langgraphWire`**：拍平 + updates 去重仍有必要；特判已收敛。继续避免再往 wire 加业务事件分支
- **Checkpointer**：进程级单例 OK；注意与 conversation `deleteThread` 成对清理（已有）

---

## 建议落地顺序

1. **注册表收拢图元数据 + input/run hooks**（减 `graphAgents` 分支痛苦）  
2. **消灭 `as unknown as` 编译类型**  
3. **SSE helper 抽出 HTTP/2 workaround**  
4. **AgentConfig schema 单一来源 + DTO**  
5. 按需拆 `service/kb.ts`  
6. 统一所有权 / 错误 throw 风格  

---

## 明确不必为「新特性」而改的

- 多 `streamMode`：已在用  
- Functional `entrypoint`/`task`：不适合现有 ReAct 对话图；新后台流水线再说  
- 用 `withStructuredOutput` / 去掉 PromptTemplate：属 `@agent/graph` / `@agent/kb`，gateway 无旧写法  

---

*生成自对 gateway 源码的只读扫读；实施前请再对一下当时文件行号与行为。*
