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

微信小程序登录（Phase 11）。客户端用 `wx.login` 拿到 `code` 后调用本接口。

请求体：

```json
{ "code": "<wx.login code>", "nickname": "小明", "avatarUrl": "https://...", "gender": "male" }
```

- `code` 必填；`nickname`/`avatarUrl`/`gender` 可选（首次登录的资料）。
- 服务端用 `code2session` 换取 `openid`（按 `openid` upsert 用户），签发本服务 JWT。
- **`AppSecret` 仅从环境变量读取，绝不返回前端；`session_key` 不返回前端、不入可读日志。**
- 服务端未配置 `WECHAT_APP_ID/SECRET` 时返回 `501 WECHAT_NOT_CONFIGURED`；
  微信侧失败返回 `401 WECHAT_<errcode>`；上游网络失败 `502 WECHAT_UPSTREAM_ERROR`。

成功响应同 `mock-login`：`{ token, user }`。

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

---

# Phase 5–10 业务接口

> 以下接口**全部需鉴权**（`Authorization: Bearer <token>`），并要求当前用户已绑定情侣
> （否则 `404 NO_ACTIVE_COUPLE`）。所有查询按 `coupleId` 隔离；不属于本情侣或已软删除的
> 资源一律返回 `404 NOT_FOUND`。经纬度在响应中转为数字。

## Places（地点）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/places` | 新建地点（title、latitude、longitude 必填；placeType/visibility 可选） |
| GET | `/api/places` | 列表，可选 `?placeType=` |
| GET | `/api/places/markers` | 地图标记轻量列表 `{id,title,latitude,longitude,placeType}` |
| GET | `/api/places/:id` | 详情 |
| PATCH | `/api/places/:id` | 更新 |
| DELETE | `/api/places/:id` | 软删除 |

```json
{ "success": true, "data": { "place": { "id": "...", "title": "初遇咖啡", "latitude": 31.2304, "longitude": 121.4737, "placeType": "visited", "visibility": "couple" } } }
```

## Memories（回忆）

关联某个 Place（`placeId` 必填，且须属于本情侣，否则 `404 PLACE_NOT_FOUND`）。列表/详情内联未删除的 `media`。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/memories` | 新建（placeId、title 必填） |
| GET | `/api/memories` | 列表，可选 `?placeId=` |
| GET | `/api/memories/:id` | 详情（含 media） |
| PATCH | `/api/memories/:id` | 更新 title/content/mood/memoryDate/visibility |
| DELETE | `/api/memories/:id` | 软删除 |

## Media（照片元数据）

> 真实签名上传见 Phase 12；此处仅保存客户端已上传后得到的 `fileUrl`/`objectKey` 元数据。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/media/upload-credential` | 签发图片上传凭证（mimeType 必填；限图片类型、≤10MB） |
| POST | `/api/media` | 新建（memoryId、fileUrl、objectKey、mimeType 必填；须属于本情侣的 memory） |
| GET | `/api/media?memoryId=...` | 某回忆的照片列表（按 sortOrder 升序） |
| DELETE | `/api/media/:id` | 软删除 |

**上传流程（Phase 12）**：客户端先 `POST /api/media/upload-credential` 拿 `{ provider, objectKey, fileUrl, uploadUrl, maxBytes, mimeType }`，直传对象存储后再用拿到的 `objectKey/fileUrl` 调 `POST /api/media` 保存元数据。`provider=local` 仅开发用（`uploadUrl=null`）；`cos/oss` 需引入厂商 SDK 后接线，未接线时返回 `501 STORAGE_PROVIDER_NOT_WIRED`。非图片类型返回 `415 UNSUPPORTED_MEDIA_TYPE`。**存储访问密钥仅服务端读取，绝不返回前端。**

## Checkins（位置打卡）

> **隐私默认**：不做后台定位、仅用户主动打卡；`shareScope` 默认 `self`。伴侣位置仅在打卡
> `shareScope` 为 `partner`/`memory` 且未过期时可见。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/checkins` | 打卡（latitude/longitude 必填；shareScope 默认 self；shareTtlMinutes 决定 expiresAt） |
| GET | `/api/checkins` | 我自己的打卡（倒序，≤50） |
| GET | `/api/checkins/partner-latest` | 伴侣最近一次**有效共享**位置 + 直线距离（米）；无则均为 null |
| DELETE | `/api/checkins/:id` | 软删除自己的打卡 |

```json
{ "success": true, "data": { "checkin": { "id": "...", "shareScope": "partner", "expiresAt": "<ISO>" }, "distanceMeters": 1234.56 } }
```

## Tasks（任务）

状态机：`pending →(assignee accept)→ accepted →(assignee complete)→ completed →(creator confirm)→ confirmed`；
`pending →(assignee reject)→ rejected`；`pending|accepted →(creator cancel)→ cancelled`。
错误人物 `403 FORBIDDEN`，非法流转 `409 INVALID_TASK_TRANSITION`。`confirm` 时在**事务**内给
assignee 记一次任务积分（points>0），凭流转保证只发一次。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/tasks` | 新建（title、assigneeId=伴侣；points 可选） |
| GET | `/api/tasks` | 列表，可选 `?status=` |
| GET | `/api/tasks/:id` | 详情 |
| POST | `/api/tasks/:id/accept` `/reject` `/complete` `/confirm` `/cancel` | 状态流转 |

## Points & Sign-in（积分与签到）

余额 = 不可变 `PointLedger` 流水求和；不直接改用户字段。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/points/balance` | 当前余额 |
| GET | `/api/points/ledger` | 我的流水（倒序，≤100） |
| POST | `/api/points/signin` | 每日签到（+5，每日仅一次，否则 `409 ALREADY_SIGNED_IN_TODAY`） |

## Shop & Redemption（商城与背包）

兑换/退回均走 `prisma.$transaction`，保证库存、积分、兑换状态一致。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST/GET/PATCH/DELETE | `/api/shop/items[/:id]` | 商品 CRUD（软删除） |
| POST | `/api/shop/items/:id/redeem` | 兑换：校验库存>0、余额≥价格；扣库存、记负分、生成 unused 兑换 |
| GET | `/api/shop/redemptions` | 我的背包 |
| POST | `/api/shop/redemptions/:id/use` | 标记已用（unused→used） |
| POST | `/api/shop/redemptions/:id/cancel` | 取消并退分、回补库存（unused→cancelled） |

兑换错误：`404 ITEM_UNAVAILABLE`、`409 OUT_OF_STOCK`、`409 INSUFFICIENT_POINTS`。

## Events（日程/纪念日）

`daysUntil` 以今天 00:00（本地）为基准，负数表示已过。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST/GET/PATCH/DELETE | `/api/events[/:id]` | 事件 CRUD（软删除）；列表按 eventDate 升序，可选 `?eventType=` |

## Dashboard（首页聚合）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/dashboard` | `daysTogether`、`pointsBalance`、`recentMemories`(5)、`pendingTasks`(计数)、`upcomingEvents`(5) |

## Privacy Consents（隐私授权，按用户）

`PrivacyConsent` 仅按 `userId` 隔离（与情侣无关），**追加写**，每次同意/撤销新增一行。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/privacy/consents` | 我的授权记录（倒序） |
| POST | `/api/privacy/consents` | 记录授权/撤销（consentType、version、agreed） |

## Public Share（公开分享骨架）

> **骨架**：仅维护分享开关与唯一 `shareCode`，**不暴露任何坐标**。公开地图内容与坐标脱敏
> （家/学校/工作不外泄）在 **Phase 10** 实现；产品层默认关闭。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/public-shares` | 创建分享记录（title；shareCode 12 位 hex，冲突重试） |
| GET | `/api/public-shares` | 列表 |
| POST | `/api/public-shares/:id/disable` `/enable` | 关闭/开启 |
