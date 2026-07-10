# Qdrant 向量库服务

知识库 RAG 的向量存储，支持 dense（1024 维 BGE-M3）+ sparse（内置 BM25）混合检索。

## 前置条件

- Docker / Docker Compose
- 仓库根目录 [`.env`](../../.env)（可选，用于端口等覆盖）

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `QDRANT_API_PORT` | `6333` | REST API 端口 |
| `QDRANT_GRPC_PORT` | `6334` | gRPC 端口 |
| `QDRANT_URL` | `http://localhost:6333` | Node 客户端连接地址（根 `.env`） |
| `QDRANT_COLLECTION_PREFIX` | `kb_` | 集合名前缀（可选） |

## 快速启动

```bash
cd infra/qdrant
docker compose up -d
```

健康检查：

```bash
curl http://localhost:6333/healthz
# 应返回 200
```

停止服务：

```bash
docker compose down
```

## 数据目录

| 路径 | 说明 |
|------|------|
| `./qdrant_data/` | 持久化存储（已 gitignore） |
| `./snapshots/` | 快照备份目录（已 gitignore） |

## 备份

```bash
# 创建快照（需 Qdrant API）
curl -X POST "http://localhost:6333/collections/{collection_name}/snapshots"
```

快照文件保存在 `./snapshots/` 挂载卷内。
