# markitdown 文档转换服务

将 docx / pdf / html / md 等格式转为 Markdown，供知识库 ingest 管线使用。

## 快速启动

```bash
cd infra/markitdown
docker compose up --build -d
```

健康检查：

```bash
curl http://localhost:8200/health
# {"status":"ok"}
```

## API

### `POST /convert`

`multipart/form-data`，字段名 `file`。

```bash
curl -X POST http://localhost:8200/convert \
  -F "file=@/path/to/document.docx"
```

响应：

```json
{
  "markdown": "# Title\n\n...",
  "filename": "document.docx"
}
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `KB_MARKITDOWN_PORT` | `8200` | 服务端口 |
| `KB_MARKITDOWN_URL` | `http://localhost:8200` | Node 客户端地址（根 `.env`） |
