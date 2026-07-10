# Agent 工作规范

本仓库由 AI Agent 协助开发。完成任何代码修改后，**必须**通过以下检查，再宣称任务完成、提交或交付 PR。

## 强制门禁（按顺序）

在仓库根目录执行：

```bash
pnpm run lint    # ESLint，必须 0 error
pnpm tc          # 全仓 TypeScript 类型检查，必须 0 error
```

若改了测试相关逻辑，lint 与 tc 通过后还应：

```bash
pnpm test        # 或针对改动包的测试文件
```

## Lint

- 命令：`pnpm run lint`（覆盖 `apps/` 与 `packages/`）
- 可自动修复时先 `pnpm run format`，再重新 `pnpm run lint`
- 不要用 `--no-verify` 等方式绕过（除非用户明确要求）

## Typecheck

- 命令：`pnpm tc`（递归各 workspace 包，底层为 `tsc-go --noEmit`）
- 改了 `.ts` / `.tsx` 必须跑 tc；测试文件（`*.test.ts`）同样受检
- 新增或修改 mock、类型断言时，确保测试文件本身类型正确，不要依赖 `any` 隐式推断

## 完成标准

以下全部满足才可结束任务：

1. `pnpm run lint` — 0 error
2. `pnpm tc` — 0 error
3. 相关测试通过（若改动影响行为或测试）
