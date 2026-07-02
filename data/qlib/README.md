# Qlib 量化数据服务

基于 [qlib 官方 Docker 镜像](https://github.com/microsoft/qlib#docker-images) 的 FastAPI 服务，从 Tushare 拉取**全部 A 股**上市股票日线行情，转换为 qlib bin 格式，并通过 SSE 向外流式输出运行日志。

## 前置条件

- Docker / Docker Compose
- 仓库根目录 [`.env`](../../.env) 中配置 `TUSHARE_TOKEN`（[tushare.pro](https://tushare.pro) 用户中心获取）

可选环境变量见根目录 [`.env.example`](../../.env.example)：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `TUSHARE_TOKEN` | — | Tushare API Token（必填） |
| `TUSHARE_REQUEST_INTERVAL_SEC` | `5` | Tushare 请求基础间隔（秒） |
| `TUSHARE_REQUEST_INTERVAL_STEP_SEC` | `5` | 超时/限流时每次增加的间隔（秒） |
| `TUSHARE_REQUEST_INTERVAL_MAX_SEC` | `20` | 请求间隔上限（秒） |
| `QLIB_API_PORT` | `8000` | 服务端口 |
| `QLIB_DATA_DIR` | `data/qlib/qlib_data/cn_data` | 本地 qlib 数据目录（容器外路径） |

## 快速启动

```bash
cd data/qlib
docker compose up --build -d
```

健康检查：

```bash
curl http://localhost:8000/health
# {"status":"ok"}
```

停止服务：

```bash
docker compose down
```

> **说明**：官方 qlib 镜像为 `linux/amd64`。在 Apple Silicon 上会通过模拟运行，首次构建拉取镜像较慢。

## API 使用

### 健康检查

```bash
GET /health
```

### 日志流（SSE）

实时订阅服务与 qlib 运行日志：

```bash
curl -N http://localhost:8000/api/logs/stream
```

可选参数 `?level=INFO`（`DEBUG` / `INFO` / `WARNING` / `ERROR`）。

事件格式：

```json
{"ts": "...", "level": "INFO", "logger": "qlib_service.sync", "message": "..."}
```

建议在触发同步前先开启日志订阅，以便观察进度。

### 触发数据同步

支持两种模式：

| 模式 | 用途 | 说明 |
|------|------|------|
| `backfill` | 历史回填 | 按股票拉取区间日线，适合首次同步 |
| `incremental` | 日常增量 | 从水位起补全至目标交易日的全部缺口（按日截面拉取） |

**历史回填**（默认 `mode=backfill`）：

```bash
curl -X POST http://localhost:8000/api/data/sync \
  -H 'Content-Type: application/json' \
  -d '{"mode": "backfill", "resume": true}'
```

**日常增量**（自动 bootstrap/reconcile；从 CSV 快照水位补最新交易日，**不会重拉 zip 里已有数据**）：

```bash
curl -X POST http://localhost:8000/api/data/sync \
  -H 'Content-Type: application/json' \
  -d '{"mode": "incremental"}'
```

补洞至指定交易日（含中间所有开市日）：

```bash
curl -X POST http://localhost:8000/api/data/sync \
  -H 'Content-Type: application/json' \
  -d '{"mode": "incremental", "trade_date": "20250702"}'
```

请求体字段：

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `mode` | string | `backfill` | `backfill` 或 `incremental` |
| `trade_date` | string | 自动 | 增量模式目标交易日 `YYYYMMDD`（补全水位至该日） |
| `start_date` | string | 自动 | 回填起始 `YYYYMMDD` |
| `end_date` | string | 今天 | 回填结束 `YYYYMMDD` |
| `resume` | bool | `true` | 回填时从 checkpoint 续传 |
| `force` | bool | `false` | 忽略水位/checkpoint 强制重跑 |
| `limit` | int | — | 限制股票数量（调试用） |
| `symbols` | string[] | — | 仅回填指定 `ts_code` |

调试示例（仅回填 3 只股票）：

```bash
curl -X POST http://localhost:8000/api/data/sync \
  -H 'Content-Type: application/json' \
  -d '{"mode": "backfill", "force": true, "limit": 3}'
```

### 查询同步进度

```bash
curl http://localhost:8000/api/data/sync/status
```

返回示例：

```json
{
  "running": false,
  "mode": "incremental",
  "phase": "done",
  "trade_date": "20250702",
  "last_success_trade_date": "20250702",
  "symbols_total": 0,
  "completed_count": 0,
  "failed_count": 0,
  "progress_pct": 0.0,
  "updated_at": "..."
}
```

回填 `phase` 流转：`resolve_symbols` → `fetch` → `dump` → `done`。

## CLI 初始化脚本

也可在容器内独立运行，行为与 API 同步一致：

```bash
# 历史回填（断点续传）
docker compose exec qlib-api python scripts/init_tushare_data.py --mode backfill --resume

# 日常增量（默认最近开市日）
docker compose exec qlib-api python scripts/init_tushare_data.py --mode incremental

# 补跑指定交易日
docker compose exec qlib-api python scripts/init_tushare_data.py \
  --mode incremental --trade-date 20250702

# 强制全量回填
docker compose exec qlib-api python scripts/init_tushare_data.py --mode backfill --force

# 指定日期范围回填
docker compose exec qlib-api python scripts/init_tushare_data.py \
  --mode backfill --start-date 20240701 --end-date 20250701 --resume

# 单股补历史
docker compose exec qlib-api python scripts/init_tushare_data.py \
  --mode backfill --symbols 301001.SZ --start-date 20240601
```

收到 `SIGINT` / `SIGTERM` 时，当前股票处理完成后安全退出，进度已写入 `source/_runtime/`，下次 `--resume` 可继续。

```bash
# 仅从 CSV bootstrap/reconcile meta（不拉 API）
docker compose exec qlib-api python scripts/init_tushare_data.py --reconcile-only --write-manifest
```

## 目录说明

```
data/qlib/
├── app/              # FastAPI 应用源码（数据服务）
├── config/           # 服务配置
├── scripts/          # 数据运维：dump_bin、reconcile、init
├── strategies/       # 业务策略（筛选、回测）
│   ├── vol_spike/
│   └── day_trade/
├── qlib_data/        # qlib bin 数据（gitignore）
├── source/           # 共享数据包根目录（gitignore）
│   ├── cn_1d/        # OHLCV CSV（必传）
│   ├── sync_meta.json          # 可选共享：水位与 per-symbol 状态
│   ├── data_manifest.json      # 可选共享：打包摘要
│   └── _runtime/               # 本地运行时（不进 zip）
├── Dockerfile
└── docker-compose.yml

local_report/         # 策略报告输出（仓库根目录，gitignore）
```

| 路径 | 内容 |
|------|------|
| `source/cn_1d/*.csv` | Tushare 日线中间文件（**数据本体**） |
| `source/sync_meta.json` | 全局 + per-symbol 水位（可选随 zip 共享） |
| `source/data_manifest.json` | 打包摘要：股数、min/max date（可选） |
| `source/_runtime/sync_checkpoint.json` | 本地回填/增量断点（**不传**） |
| `source/_runtime/symbol_events.jsonl` | 本地停牌/无行情审计（**不传**） |
| `qlib_data/cn_data/` | qlib 格式数据（calendars / features / instruments） |

## 共享数据包

**传 zip = 传 CSV 行情数据，不是传 sync 进度。**

checkpoint、symbol_events 等运行时状态在 `source/_runtime/`，各机器本地维护，不要打进共享 zip。

### 打包（发送方）

```bash
# reconcile + zip 到仓库根目录（自动排除 _runtime / __MACOSX / .DS_Store）
pnpm qlib:package
pnpm qlib:package -o qlib-source-20260701.zip
```

### 解包（本机从 zip 恢复）

```bash
# 默认解压仓库根目录 source.zip → data/qlib/source
pnpm qlib:unpack
pnpm qlib:unpack source.zip
# 自动：解压 → 删 __MACOSX → bootstrap/reconcile sync_meta
```

### 接收（同事）

```bash
# 解压到 data/qlib/source/
# 若无 sync_meta.json，首次 incremental 会自动 bootstrap（扫 CSV 写 meta，不触发 backfill）
curl -X POST http://localhost:8000/api/data/sync \
  -H 'Content-Type: application/json' \
  -d '{"mode": "incremental"}'

# 本地 dump 生成 qlib_data
docker compose exec qlib-api python scripts/dump_bin.py dump_update \
  --data_path /app/source/cn_1d --qlib_dir /root/.qlib/qlib_data/cn_data
```

**禁止**对已有数据包跑 `backfill`（会被安全门拦截）；单股补历史可用 `--symbols` 或 `--force`。

### reconcile / bootstrap

```bash
# 从 CSV 扫描并校正 sync_meta
python scripts/reconcile_source.py --write-manifest

# API
curl -X POST http://localhost:8000/api/data/reconcile/sync \
  -H 'Content-Type: application/json' \
  -d '{"write_manifest": true}'
```

### 从旧 layout 迁移（state/ → source/_runtime/）

```bash
python scripts/migrate_source_layout.py
python scripts/reconcile_source.py --write-manifest
```

## 策略（strategies/）

报告默认输出到仓库根目录 `local_report/`（容器内挂载为 `/local_report`）。

```bash
# 放量筛选
docker compose exec qlib-api python -m strategies.vol_spike.screener

# 当天买当天卖回测
docker compose exec qlib-api python -m strategies.day_trade.backtest

# 本地（在 data/qlib 目录下）
PYTHONPATH=. python -m strategies.vol_spike.screener
PYTHONPATH=. python -m strategies.day_trade.backtest
```

### 增量同步机制

- 通过 `trade_cal` 判断是否为交易日
- **自动补洞**：从 `sync_meta.last_success_trade_date`（CSV 快照 **max** 水位）起，仅同步真正缺失的交易日
- zip 初始化后若 CSV 已覆盖至 `20260701`，增量**不会**从 `20250701` 重拉一整年
- 使用 `daily(trade_date=...)` **截面**拉取当日全市场成交数据（每个交易日 1 次请求，非逐股）
- 使用 `suspend_d` 标记停牌/复牌，写入 `sync_meta.json` 与 `symbol_events.jsonl`
- 每完成一个交易日即更新水位并写 checkpoint，中断后可续传
- CSV **追加合并**（`drop_duplicates` 按日期去重），不写停牌假 K 线
- 全部缺口补完后统一 `DumpDataUpdate` 写 bin；首次用 `DumpDataAll`
- 水位已追平目标日时幂等跳过（`force: true` 可重跑含目标日在内的区间）

### 停牌处理

| 事件 | 判定 | 处理 |
|------|------|------|
| `traded` | 出现在 `daily(trade_date)` 截面 | 合并 CSV，更新 `last_bar_date` |
| `suspended` | 出现在 `suspend_d` | 标记 `status=suspended`，不写 bar |
| `resumed` | `suspend_d` 复牌记录 | 恢复 `status=active` |
| `no_bar` | 上市但不在截面且非停牌 | 记录事件，不造假数据 |
| `not_listed` | `list_date` 晚于交易日 | 跳过 |

## 配置

### 限流与重试

[`config/settings.yaml`](config/settings.yaml) 或环境变量：

- 默认基础间隔 **5 秒**；超时或限流时 **+5 秒**，上限 **20 秒**；成功后恢复为基础间隔
- 网络/频控错误另含指数退避重试（最多 5 次）
- 不可恢复错误（token 无效、权限不足）立即失败并记录到 checkpoint

> **全量同步耗时**：A 股约 5000+ 只，理想情况下（5 秒/次）拉取阶段约 **7～8 小时**；若频繁触发限流会退避至 20 秒/次。建议通过 SSE 日志流或 `/api/data/sync/status` 观察进度；中断后 `resume: true` 可续传。

## 典型工作流

```bash
# 1. 启动服务
cd data/qlib && docker compose up -d

# 2. 首次：历史回填（慢，支持断点续传）
curl -X POST http://localhost:8000/api/data/sync \
  -H 'Content-Type: application/json' \
  -d '{"mode": "backfill", "resume": true}'

# 3. 日常更新：自动补洞至最近开市日（停更数周也能一次追上）
curl -X POST http://localhost:8000/api/data/sync \
  -H 'Content-Type: application/json' \
  -d '{"mode": "incremental"}'

# 4. 订阅日志 / 查看进度
curl -N http://localhost:8000/api/logs/stream
curl http://localhost:8000/api/data/sync/status
```

回填中断后重新执行步骤 2（`resume: true`）即可续传。
