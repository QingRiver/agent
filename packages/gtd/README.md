# @agent/gtd

GTD 领域核心包：行模型、树与继承、声明式状态转换、意图执行（apply）、透视与 Forecast。

## 分层（自底向上）

```
L0  data          types / row-schema / rows / normalize-rows / GtdReader
L1  structure     tree / order（descendantTaskIds = subtree ids）
L2  projection    GtdReader（RowStore 读口 + 缓存 taskTree + effective/availability 便捷方法）
L3  inheritance   effective(读) / cascade(plan)
L4  view          perspective / filter / forecast
L5  command       state-machine(执行) + transitions + repeat
        └── ops/  planXxxOp(reader, input): GtdIntent[]  ← UI Store 只触发
```

- **ops**：编排多意图批次（move/indent/tags…）；**state-machine**：执行单条命令
- **GtdReader**：读侧门面；`taskTree` 实例内惰性缓存
- **apply**：`applyIntents` 跑 command / mutation / purge
- 客户端 `GtdStore`：atoms / sync / debounce；方法体调用 `planXxxOp`

## 目录（不含测试）

```
command/
├── transitions.ts                # STATUS_TRANSITIONS + canTransition / availableStatusActions
├── state-machine.ts              # 执行：complete / create / move / …
├── repeat.ts                     # 重复规则生成下一实例
└── ops/                          # 编排：planXxxOp → GtdIntent[]

data/
├── types.ts                      # 枚举常量与中文文案
├── schema.ts                     # Zod 实体 schema
├── row-schema.ts                 # EntityRow / GtdCommand / GtdMutation / GtdEntity
├── filter-schema.ts              # 持久化 FilterNode / LOGIC_OP / LEAF_OP
├── normalize-rows.ts             # 读路径投影（标签/挂载过滤）
├── rows.ts                       # 查询面：live*/findLive/taskTree + RowStore
└── reader.ts                     # GtdReader（缓存 tree）

structure/
├── tree.ts                       # Task 树原语 + descendantTaskIds
└── order.ts                      # 分数排序与重排

inheritance/
├── effective.ts                  # 有效 defer/due/status/挂载
└── cascade.ts                    # 重开/恢复/删除等 cascade 计划（complete/drop 恒空，不公开导出）

derived/
├── availability.ts               # computeAvailability / due_soon 等
├── suppressing-ancestor.ts       # UI 压制祖先提示
├── invariant.ts                  # 不变量校验
└── forecast/                     # Forecast 预测栏

apply/
├── intent.ts                     # 命令 / 字段补丁执行器
└── apply.ts                      # applyIntents + ApplyRequest / GtdIntent schema

time/                             # 墙钟 / 日历 / 日期运算 / normalize

view/
├── perspective.ts                # 透视匹配与内置透视
├── reorder-eligibility.ts        # 当前屏可手动排序的兄弟组
└── filter/                       # 过滤求值 / 校验（schema 从 data/filter-schema re-export）

fixtures/
├── intents.ts                    # 命令 / 补丁构造助手
└── …                             # factories / scenarios / forecast 等
```

## 状态转换表

权威边表在 `command/transitions.ts`（`STATUS_TRANSITIONS`）。对外命令是薄封装；UI 用 `canTransition` / `availableStatusActions`，不要散落 `status === ACTIVE` 判断。

| action | from | to | cascade |
|--------|------|-----|---------|
| complete | ACTIVE | COMPLETED | 无（克隆下一实例等副作用在 `completeTask`） |
| drop | ACTIVE | HOLD | 无 |
| reopen | COMPLETED | ACTIVE | `planReopenCascade` |
| restore | HOLD | ACTIVE | `planRestoreCascade` |
| delete | ACTIVE/COMPLETED/HOLD | DELETED | `planDeleteCascade` |
| restore_from_trash | DELETED | ACTIVE | `planRestoreFromTrashCascade` |

`createTask` / `moveTask` 不进状态图（改树拓扑）。DB 列仍为 `sync_id`（行修订号）；领域字段可继续叫 `syncId`。

## 状态级联与不变量 INV

任务状态四种：`ACTIVE` / `COMPLETED` / `HOLD` / `DELETED`（回收站）；后三种为终态。

**不变量 INV**：终态节点不能有 `ACTIVE` 后代 ≡ 任一 `ACTIVE` 节点的祖先链必须全 `ACTIVE`。
`derived/invariant.ts` 校验此不变量。细节见 `inheritance/effective.ts`、`inheritance/cascade.ts`、`inheritance/cascade.test.ts` [SP-LINK-STATE]。

## 模块一览

| 目录 | 职责 |
|------|------|
| `command` | 转换表 + 状态执行 + ops 编排 + 重复 |
| `data` | 行模型、契约、rows / GtdReader、normalizeRows |
| `structure` | Task 树原语与 order |
| `inheritance` | 有效字段继承与级联计划 |
| `derived` | 可用性、不变量、Forecast、压制祖先 |
| `apply` | 意图执行（服务端权威 + 客户端乐观预览） |
| `time` | 墙钟 / 日历 / 日期运算 |
| `view` | 透视、过滤求值、重排资格 |
| `fixtures` | 可复现场景数据 |
| `prompts` | Agent 提示词素材 |
