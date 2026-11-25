# @agent/skills

Skill 领域包：通用 skill 规范 + 内置 skill 目录。单包两层子路径，规范层同构无 fs，fs/注册层仅 server/CLI。

目标是让 skill 符合跨 agent 互操作的事实标准——一个 skill = 一个目录，入口 `SKILL.md`（YAML frontmatter + markdown body）+ 任意相对路径支持文件。`skills/<skill>/` 目录本身即可被 Claude Code / Cursor / Codex 直接消费。

## 子路径

| 入口 | 形态 | 用途 |
|------|------|------|
| `@agent/skills` | 同构（无 fs） | 规范层：frontmatter 解析、路径安全、code slug、索引格式、`SkillBinding` 类型。可进浏览器 bundle |
| `@agent/skills/node` | Node only | fs 读写 + 内置 skill 注册：`readSkillDir` / `SkillBundle` / `loadBuiltInSkills` / `composeBuiltInSkillIndex` / `CODE_CARD_SYSTEM_PROMPT` |

client 经 `@agent/proto` 的 re-export shim 间接用规范层（同构，不引 fs）；graph / gateway 直接消费两个子路径。

## 目录

```text
skills/<skill>/            # 内置 skill 内容目录（仓库源、只读）
  SKILL.md                 # 入口：YAML frontmatter(name/description + 扩展字段) + body
  refs/*.md                # 附属文件，read_skill_file 按 path 读
src/
├── spec.ts                # 常量：SKILL_ENTRY_FILENAME、RESERVED_SKILL_CODES、ALLOWED_EXTS
├── code.ts                # slugifySkillCode / canonicalSkillCode / isValidSkillSlug
├── frontmatter.ts         # js-yaml 解析，透传 allowed-tools 等扩展字段
├── path.ts                # normalizeSkillPath / readSkillFile
├── context.ts             # formatSkillContext / resolveBoundSkillCode / SkillBinding
├── index.ts               # 主入口：re-export 规范层
└── node/
    ├── bundle.ts          # readSkillDir → SkillBundle
    ├── builtInSkills.ts   # 枚举 skills/*/，composeBuiltInSkillIndex 急切 inline
    ├── codeCard.ts        # CODE_CARD_SYSTEM_PROMPT（dev graph 用，源为 html-card/refs）
    └── index.ts           # /node 子入口
```

## 内置 skill

`skills/` 下每个子目录是一个内置 skill（系统 tier，仓库源、只读）：

- `html-card`：HTML 沙箱卡片写作规约，`render_code_card` 工具的配套规约。
- `rag-cite`：检索增强回答纪律（先检索、引用来源、不臆造）。
- `clarify-ask`：缺信息时主动提问纪律（用结构化提问工具而非正文追问）。
- `writing-editor`：中文写作编辑助手纪律（宪法、ask/write 意图分类、能力枚举）。
- `patch-edit`：SEARCH/REPLACE 补丁编辑规约（与 Claude Code Edit / Codex 同范式）。
- `home-assistant`：智能家居控制纪律（HA MCP，urlEnv=HA_URL + /api/mcp，token=HA_TOKEN）。
- `weather`：天气查询（声明 `get_weather` 脚本工具，自包含取 Open-Meteo，autoBind:false）。
- `tushare`：A 股行情分析（声明 Tushare MCP，token=TUSHARE_TOKEN，postOnlyGet；SKILL.md 含行情分析 prompt，`${to_day}` 运行时渲染）。

`loadBuiltInSkills()` 启动时枚举 `skills/*/`，`composeBuiltInSkillIndex()` 急切 inline 全部正文（含 refs），让模型不调 `read_skill_file` 即拿到平台级规约。`getBuiltInSkill(code)` 供 `read_skill_file` 同步直读。

上述内置 code 均已加入 `RESERVED_SKILL_CODES`，用户不得自建同名。

### reactAgent 接入

`resolveReactAgentRun` 每次运行合并内置 skill index 进 `skillText`/`skillBindings`。`html_card`/`rag_cite`/`clarify_ask` 三个平台级规约由此替代原来硬拼进 `composeReactAgentSystemPrompt` 的 `CODE_CARD`/`ASK`/`KB` 常量（常量保留供 client Lab 预览与非 reactAgent 图使用，内容镜像 skill）。

### editorGraph 接入（autoBind 域 skill）

`writing_editor` / `patch_edit` 是编辑器域 skill，frontmatter 标 `autoBind: false`——不进 reactAgent 平台索引（避免给通用助手注入编辑器噪声）。`editorPrompts.ts` 经 `@agent/skills/node` 的 `editorSegments` 同步加载 `writing_editor/refs/*`（constitution / ask-mode / capabilities / write-inline / write-document / classify-intent / summary）拼装运行时 system prompt，内容单一源、行为对齐原 TS 常量。改 editor prompt 即改 ref 文件，不必动 TS。

## 加一个内置 skill

1. 在 `skills/<name>/` 建 `SKILL.md`（frontmatter `name` 必须是合法 slug；`description` 必填）+ 可选 `refs/*.md`。
2. 若该 code 需防用户同名，加进 `src/spec.ts` 的 `RESERVED_SKILL_CODES`。
3. 无需改注册代码——`builtInSkills` 自动枚举。若需默认绑定进 reactAgent，`resolveReactAgentRun` 已合并内置 index。


## 声明工具（Phase 2：物化机制）

skill 目录可声明自带工具，运行时由 `materializeSkillTools`（`@agent/graph`）物化成 LangChain 工具，接入对应图：

- `tools/<name>.tool.json` —— 脚本工具：`{ name, description, inputSchema(JSON Schema), run }`，`run` 指向 `scripts/<x>.mts`。运行时 spawn `node <脚本>`（Node 24+ 直接剥离 TS 类型，无需编译），stdin 传 JSON args，stdout 作返回。脚本路径必须落在 skill 目录内（防越界）。
- `mcp/<id>.mcp.json` —— MCP 工具集：`{ id, transport:"streamable-http", url, tokenEnv?, headers?, postOnlyGet? }`。运行时按声明连接 MCP（`@agent/tools` 的 `createMcpCallable`），`listTools` 后逐个包装。secret 不进声明，按 `tokenEnv` 从环境取，替换 `url`/`headers` 里的 `${token}` 占位符。

secret 永远不进 skill 目录。内置 skill 的声明工具经 `reactAgent` 的 lazy tools 自动追加（当前内置 skill 未声明工具，返回空，行为不变；Phase 3 weather/tushare 迁移后生效）。MCP 连接失败（如 token 未设）跳过该声明并告警，不拖崩 agent。

## 用户 skill export/import

`SkillService`（gateway）提供 skill ↔ 目录互转，底层用本包 `readSkillDir`/`writeSkillDir`：

- `exportSkillToDir(userId, skillId, destDir)`：取 skill 子树每个逻辑文件的最新版（已发布最大 version，无则草稿 v0），按相对路径写成标准 skill 目录。导出的目录可 cp 进 `.claude/skills/` 给其他 agent 用。
- `importSkillFromDir(userId, dirPath, targetDirId)`：读 skill 目录，按 segments 创建子目录链（`ProjectService.createDir`，已存在则复用），在每个叶目录 upsert `version_text`（type=skill）。嵌套文件（`refs/x.md`）按子目录挂载。

proto re-export shim 已删除：所有消费方（client / graph / gateway）的 skill 符号直连 `@agent/skills`，`@agent/proto` 不再承载 skill 规范。
