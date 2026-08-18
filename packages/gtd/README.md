# @agent/gtd

GTD 领域核心包：实体模型、派生状态、同步、透视与时间工具。

## 目录（不含测试）

```
command/                          # 命令：状态机 / 重复
├── state-machine.ts              # 完成/放弃等状态流转
└── repeat.ts                     # 重复规则生成下一实例

data/                             # 数据模型与行存储
├── types.ts                      # 枚举常量与中文文案
├── schema.ts                     # Zod 实体 schema
├── sync-schema.ts                # 行级同步 mutation/command
├── shared.ts                     # mutation/command 类型守卫
├── rows.ts                       # RowStore 行级查询投影
└── serialize.ts                  # 行级 JSON 导入导出（v2.0.0）

structure/                        # 树与排序
├── tree.ts                       # Task 父子树构建
└── order.ts                      # 分数排序与重排

inheritance/                      # 继承与级联
├── effective.ts                  # 有效 defer/due/标签
└── cascade.ts                    # 完成/删除等级联步骤

derived/                          # 派生状态（不落库）
├── availability.ts               # 可用性 / due_soon 等
├── invariant.ts                  # 不变量校验
└── forecast/                     # Forecast 预测栏
    ├── types.ts                  # Forecast 类型与选项
    ├── strip.ts                  # 预设条 → 时间片
    ├── strip-offsets.ts          # 今日相对日偏移表
    ├── block-key.ts              # 日块键（今/明/后）
    ├── lanes.ts                  # 逾期/推迟等车道命中
    ├── assign.ts                 # 多车道择优归属
    └── render.ts                 # 渲染 Forecast 结果

sync/                             # 同步应用层
├── apply.ts                      # 应用 push 变更集
└── repository.ts                 # 仓库接口约定

time/                             # 时间工具
├── clock.ts                      # 墙钟 defer 解锁判断
├── calendar.ts                   # 时区日历日与时间片
├── date-math.ts                  # 重复终止与日期运算
└── normalize.ts                  # defer/due 成对规范化

view/                             # 透视与过滤视图
├── perspective.ts                # 透视匹配与内置透视
├── perspective-input.ts          # 透视输入校验解析
├── perspective-prompt.ts         # Agent 透视提示词
├── collapse.ts                   # 树塌陷可见性
└── filter/                       # 过滤 DSL
    ├── schema.ts                 # 字段/算子与 FilterNode
    ├── engine.ts                 # 过滤树求值引擎
    ├── validate.ts               # 过滤树校验与实体解析
    └── helpers.ts                # 空值等过滤辅助

fixtures/                         # 场景夹具（测/故事书）
├── constants.ts                  # 固定 NOW 与阈值
├── factories.ts                  # 实体行工厂函数
├── scenarios.ts                  # 具名行为场景集
├── sync.ts                       # sync 报文测试助手
├── perspective-prompt.ts         # 透视 prompt 样例
└── forecast.ts                   # Forecast 单测日期锚点与 opts

prompts/
└── perspective.md                # 透视 Agent 指南原文
```

## 状态级联与不变量 INV

任务状态四种：`ACTIVE` / `COMPLETED` / `HOLD` / `DELETED`（回收站）；后三种为终态。

**不变量 INV**：终态节点不能有 `ACTIVE` 后代 ≡ 任一 `ACTIVE` 节点的祖先链必须全 `ACTIVE`。
`derived/invariant.ts` 校验此不变量，所有状态命令的级联设计都为维持它。

状态模型（逐层继承 / 自身状态保真）以源码与测试为准，不在此展开易过时的具体规则：见 `inheritance/effective.ts`（有效状态逐层继承）、`inheritance/cascade.ts`（向上拉回 `planUpwardActivation`：重开/恢复子向上翻链路上**已完成**祖先→ACTIVE，祖先是搁置/删除时不向上翻）、`inheritance/cascade.test.ts` [SP-LINK-STATE]、`derived/reconcile.ts`（并发遗留违法态兜底）。

## 模块一览

| 目录 | 职责 |
|------|------|
| `command` | 高风险业务命令（状态、重复） |
| `data` | 实体 schema、行存储、行级导入导出 |
| `structure` | Task 树与 order |
| `inheritance` | 有效字段继承与级联 |
| `derived` | 可用性、不变量、Forecast |
| `sync` | push 应用与仓库抽象 |
| `time` | 墙钟 / 日历 / 日期运算 |
| `view` | 透视、过滤 DSL |
| `fixtures` | 可复现场景数据 |
| `prompts` | Agent 提示词素材 |
