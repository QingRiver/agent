# @agent/gtd

GTD 领域核心包：行模型、树与继承、声明式状态转换、意图执行（apply）、透视与 Forecast。

## 分层（自底向上）

```
L0  data            types / schema / row-schema / rows / normalize-rows
L1  state/tree      树拓扑（buildTaskTree / ancestors / subtree / descendantTaskIds）
L2  state/model     GtdModel（行读写入口 + tree 实例内惰性缓存）
L3  inheritance     state/effective（读侧继承）/ state/propagate（写侧级联）
L4  derived         availability / invariant / suppressing-ancestor / forecast（只读 state）
L5  command         op + apply + transition + repeat + errors（执行单条命令）
        └── plan/   planXxxOp(reader, input): Op[]  ← UI Store 只触发
```

- **plan**：编排多意图批次（move/indent/tags/repeat…）；**command**：执行单条命令
- **GtdModel**：读侧门面；`tree()` 实例内惰性缓存，写入后 `invalidate()`
- **apply**：`applyOps` 跑 command / mutation / purge
- 客户端 `GtdStore`：atoms / sync / debounce；方法体调用 `planXxxOp`
- **依赖方向**：data → state/tree → state/model → state/effective & derived → command & plan；derived 只读 state，不反向依赖 command/plan

## 目录（不含测试）

```
command/                         写层：Op 契约 + 执行 + 状态机 + 重复 + 报错
├── op.ts                        Op schema + 构造助手（transitionOp/deleteOp/purgeOp/stamp）
├── apply.ts                     applyOps / runOp + ApplyRequest / GtdRowsResponse schema
├── transition.ts                TRANSITIONS + canTransition / availableStatusActions / transition
├── repeat.ts                    重复规则生成下一实例（cloneIfRepeating / computeNextDates）
└── errors.ts                    面向用户的拒绝文案（taskLabel / statusRejected / taskNotFound）

data/                            L0 行模型与契约
├── types.ts                     枚举常量中心（as const + JSDoc + 中文 TEXT）
├── schema.ts                    Zod 实体 schema（Task / RepeatRule / Attachment / Perspective）
├── row-schema.ts                EntityRow / GtdEntity / 补丁约束 / createTaskData
├── filter-schema.ts             持久化 FilterNode / LOGIC_OP / LEAF_OP
├── rows.ts                      liveTasks 行查询（L0，不依赖 state）
└── normalize-rows.ts            读路径投影（挂载/标签过滤）

state/                           L1 树 / L2 读写
├── tree.ts                      Task 树原语 + descendantTaskIds
├── effective.ts                 读侧继承：effectiveStatus/Due/Defer/Planned/Mount
├── propagate.ts                 写侧级联：propagateUp（子孙激活后沿父链上翻）
├── order.ts                     分数排序与重排（orderBetween / shouldReindex / reindexSiblings）
├── model.ts                     GtdModel（行唯一读写入口 + tree 缓存）
├── create.ts                    runCreate
└── update.ts                    runMove / runPatch

derived/                         L4 派生（只读 state）
├── availability.ts              computeAvailability / computeAll（due_soon 等）
├── invariant.ts                 validateInvariants（不变量校验）
├── suppressing-ancestor.ts      UI 压制祖先提示
└── forecast/                    Forecast 预测栏

plan/                            L5 ops 编排：planXxxOp(reader, input) → Op[]
├── tasks.ts                     add/indent/outdent/reorder/status/flag/patch/purge
├── move.ts                      planMoveTaskOp
├── repeat.ts                    planSetTaskRepeatOp
├── perspectives.ts              透视增删
├── tags.ts                      标签绑定
├── order.ts                     nextOrder / targetOrder / sortedByOrder
└── shared.ts                    requireTask / tShape

view/                            透视 / 过滤求值 / 重排资格
├── perspective.ts               透视匹配与内置透视
├── perspective-input.ts         透视输入校验
├── perspective-prompt.ts        透视 → 提示词
├── catalog.ts                   CatalogProjection（project/dir/tag 名称注入）
├── collapse.ts                  折叠集合
├── reorder-eligibility.ts       当前屏可手动排序的兄弟组
└── filter/                      过滤求值 / 校验（schema 从 data/filter-schema re-export）

time/                            墙钟 / 日历 / 日期运算 / normalize
fixtures/                        可复现场景数据（factories / scenarios / ops / forecast）
scenarios/                       行为规约测试（SP-* 与 wiki 对应）
prompts/                         Agent 提示词素材
```

## 状态转换表

权威边表在 `command/transition.ts`（`TRANSITIONS` / `STATUS_TRANSITIONS`）。对外命令是薄封装；UI 用 `canTransition` / `availableStatusActions`，不要散落 `status === ACTIVE` 判断。

| action | from | to | cascade |
|--------|------|-----|---------|
| complete | ACTIVE | COMPLETED | 无（克隆下一实例等副作用在 `cloneIfRepeating`） |
| drop | ACTIVE | HOLD | 无 |
| reopen | COMPLETED | ACTIVE | `propagateUp`（`state/propagate`） |
| restore | HOLD | ACTIVE | `propagateUp` |
| delete | ACTIVE/COMPLETED/HOLD | DELETED | 无 |
| restore_from_trash | DELETED | ACTIVE | `propagateUp` |

`createTask` / `moveTask` 不进状态图（改树拓扑）。DB 列仍为 `sync_id`（行修订号）；领域字段可继续叫 `syncId`。

## 状态级联与不变量 INV

任务状态四种：`ACTIVE` / `COMPLETED` / `HOLD` / `DELETED`（回收站）；后三种为终态。

**不变量 INV**：终态节点不能有 `ACTIVE` 后代 ≡ 任一 `ACTIVE` 节点的祖先链必须全 `ACTIVE`。
`derived/invariant.ts` 校验此不变量。读侧继承见 `state/effective.ts`，写侧级联见 `state/propagate.ts`。

## 模块一览

| 目录 | 职责 |
|------|------|
| `command` | Op 契约 + 转换表 + 状态执行 + 重复 + 报错 |
| `data` | 行模型、契约、rows / normalizeRows |
| `state` | 树原语、effective 继承、propagate 级联、order、GtdModel、create/update |
| `derived` | 可用性、不变量、Forecast、压制祖先 |
| `plan` | ops 编排（tasks / move / repeat / perspectives / tags） |
| `view` | 透视、过滤求值、重排资格 |
| `time` | 墙钟 / 日历 / 日期运算 |
| `fixtures` | 可复现场景数据 |
| `scenarios` | 行为规约测试 |
| `prompts` | Agent 提示词素材 |
