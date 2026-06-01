# API — love-map-mini

后端基础地址（开发）：`http://localhost:3000`

## 统一响应格式

成功：

```json
{ "success": true, "data": {} }
```

失败：

```json
{
  "success": false,
  "error": { "code": "ERROR_CODE", "message": "Human readable message" }
}
```

## 鉴权约定

- 除明确标注「公开」的接口外，所有接口都需要鉴权（Bearer token）。
- 所有情侣资源都必须校验 `userId` 与 `coupleId`，防止越权访问。

---

## Phase 1

### GET /health

健康检查。公开，无需鉴权。

响应：

```json
{
  "success": true,
  "data": { "status": "ok", "service": "love-map-mini-api", "time": "<ISO8601>" }
}
```

> 业务接口（Auth / Couple / Place / Memory / Checkin / Task / Point / Shop / Event /
> Privacy / PublicShare）将在 Phase 4 起逐步补充到本文件。
