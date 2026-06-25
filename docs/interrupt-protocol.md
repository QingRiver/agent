# 中断协议：CLI / LangGraph / AG-UI 的中断与恢复

> 本期范围：把"中断 → 恢复"这个**过程**在多源之间对齐，核心动作是**穿通 `interruptId`**。
> **不含持久化、不含断线重试**（CLI 无持久化；跨进程恢复由 langgraph checkpoint 后端承担）。

## 背景：三个中断源，一个交互层

中断/恢复发生在 agent 执行需要"外部（用户）输入"时。本仓库存在/将要存在多个中断源：

| 源 | 挂起原语 | 恢复触发 |
|---|---|---|
| **CLI agent**（Effect） | `interact(req)` → `Effect.async` 挂起 fiber | `respond(resp)` 回调 resume fiber |
| **LangGraph** | 图节点 `interrupt(payload)` | 新 run 带 `Command({resume})` |
| **未来：hooks 事件中断** | 监听 agent tools hooks 事件挂起 | 事件回调 resume |

它们都是"交互层"的平等成员。本协议把这些形状统一到一个**中性类型**，各源各自做一层薄映射，核心协议稳定。

## 中性协议（`@agent/protocol`）

纯类型包，零运行时依赖。一等公民：

```ts
type InterruptRequest
  = | { interruptId, type: 'input' | 'select' | 'multiSelect' | 'modal' | 'approval' | 'unlock', ... }

interface InterruptResponse { interruptId, type, payload }
```

**`interruptId` 是恢复路由的唯一依据**：多源/并发中断时，响应靠 id 匹配回正确的中断点。这是本期最关键的字段。

## CLI 侧实现

### 挂起时生成 id

`use-conversation.ts` 的 `interact` Live 实现：`Effect.async` 挂起前 `randomUUID()` 生成 `interruptId`，存入 `pendingInterruptIdRef`。

### 恢复时校验 id

`respond(response)`：
- 从 `pendingInterruptIdRef` 取当前挂起 id，补进 response（**对 UI 透明**——UI 只传 `{type, payload}`，签名是 `Omit<InteractionResponse, 'interruptId'>`）。
- 无挂起中断 → 忽略（防止过期响应误触发）。
- resume fiber 后清空 id 与 resolveRef。

> 注：本期 CLI 单挂起中断（一次只一个 `interaction`），id 校验主要是"防过期响应"与"为多源并发预留"。进程内 fiber 续跑语义不变。

### 中性协议映射

`packages/cli/src/core/interrupt-protocol.ts`：CLI `InteractionRequest/Response` ↔ 中性 `InterruptRequest/Response` 互转。CLI 请求侧不带 id（挂起时生成），映射时补全。

## LangGraph / AG-UI 侧（本期不强改）

server 侧已有完整的中断/恢复链路，**本期零改动**，仅确认与中性协议对齐：

- `mapInterruptPayloadToAgUi`：langgraph `InterruptPayload` → AG-UI `Interrupt`（reason 由 `type` 推导，与 CLI 映射同构）。
- `resolveResumeFromRunAgentInput`：`RunAgentInput.resume[]` → `Command({resume})`。
- `extractPendingInterruptFromSnapshot`：从 checkpoint task hydrate 挂起中断。

langgraph 的 `interruptId` 来自 task.interrupts[].id，与 CLI 的 `randomUUID()` 同语义。两者在中性协议层同构。

## 明确不做（本期边界）

- **InterruptStore / 持久化**：CLI 不落盘。
- **跨进程 / 断线重试**：CLI fiber 无法跨进程续跑；此能力由 langgraph checkpoint 后端提供，CLI 将来直连 server 时才获得。
- **ConversationState 状态模型重构**：保持现有 `llmMessagesRef` + `interaction` state 真相源不动。
- **server 侧改动**。

## 演进路径

未来加第三个中断源（hooks 事件中断）时：
1. 在该源挂起点生成 `interruptId`。
2. 写一层薄映射到中性 `InterruptRequest/Response`。
3. 核心 protocol 包与 CLI/langgraph 现有代码不动。

未来若要 CLI 获得跨进程恢复（路径 B）：把可恢复状态显式提为 `ConversationState = { messages, pendingInterrupts }` 落盘，`respond` 改为"写回 messages + 驱动循环"。这是在 id 穿通之上的增量，不推翻本期。
