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

## Phase 4 — 认证与情侣绑定

> 登录后所有需鉴权接口须带 `Authorization: Bearer <token>`。令牌为 JWT，载荷仅含
> `sub`（用户 id）。未带或无效令牌返回 `401 UNAUTHORIZED`。

### POST /api/auth/mock-login

开发联调用的 mock 登录，**生产禁用**（返回 `403 MOCK_LOGIN_DISABLED`）。无密码，
按 `mockId` 区分/复用用户（openid = `mock:<mockId>`）。

请求体：

```json
{ "nickname": "小明", "mockId": "a", "avatarUrl": "https://...", "gender": "male" }
```

- `nickname` 必填（1–30）；`mockId` 必填（1–50）；`avatarUrl` 可选（URL）；
  `gender` 可选（`unknown|male|female`）。

响应：

```json
{
  "success": true,
  "data": {
    "token": "<jwt>",
    "user": { "id": "...", "nickname": "小明", "avatarUrl": null, "gender": "male", "birthday": null, "createdAt": "<ISO8601>" }
  }
}
```

### POST /api/auth/wechat-login

真实微信登录占位，将在 **Phase 11** 实现。当前返回：

```json
{ "success": false, "error": { "code": "NOT_IMPLEMENTED", "message": "WeChat login will be implemented in Phase 11." } }
```

状态码 `501`。**不涉及任何 AppSecret**。

### GET /api/me

需鉴权。返回当前登录用户。

```json
{ "success": true, "data": { "user": { "id": "...", "nickname": "小明", "avatarUrl": null, "gender": "male", "birthday": null, "createdAt": "<ISO8601>" } } }
```

用户不存在返回 `404 USER_NOT_FOUND`。

### POST /api/couples/invite

需鉴权。生成或刷新自己的邀请码（6 位数字，有效期 24h）。已绑定者返回
`409 ALREADY_BOUND`。重复调用会刷新同一条 pending 邀请的码与有效期。

```json
{ "success": true, "data": { "couple": { "id": "...", "status": "pending", "inviteCode": "048213", "inviteExpiresAt": "<ISO8601>" } } }
```

### POST /api/couples/accept

需鉴权。用邀请码接受绑定。

请求体：`{ "inviteCode": "048213" }`（6 位数字）。

- 已绑定 → `409 ALREADY_BOUND`
- 邀请码无效/已被使用 → `404 INVITE_INVALID`
- 邀请码过期 → `410 INVITE_EXPIRED`
- 接受自己的邀请 → `400 CANNOT_ACCEPT_OWN_INVITE`

成功后关系变为 `active`，`togetherAt` 默认填当前时间：

```json
{ "success": true, "data": { "couple": { "id": "...", "userAId": "...", "userBId": "...", "status": "active", "togetherAt": "<ISO8601>", "createdAt": "<ISO8601>" } } }
```

### GET /api/couples/current

需鉴权。返回当前 active 关系与伴侣公开信息；未绑定时 `couple` 与 `partner` 均为 `null`。

```json
{ "success": true, "data": { "couple": { "id": "...", "status": "active", "...": "..." }, "partner": { "id": "...", "nickname": "小红", "avatarUrl": null, "gender": "female" } } }
```

### POST /api/couples/unbind

需鉴权。解绑当前关系（置为 `unbound`，保留历史记录）。无生效关系返回
`404 NO_ACTIVE_COUPLE`。

```json
{ "success": true, "data": { "couple": { "id": "...", "status": "unbound", "...": "..." } } }
```

---

> 其余业务接口（Place / Memory / Checkin / Task / Point / Shop / Event / Privacy /
> PublicShare）将在 Phase 5 起逐步补充。
