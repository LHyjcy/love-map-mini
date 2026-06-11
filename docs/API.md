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

> **限流**：敏感接口 `/api/auth/*`、`/api/couples/invite`、`/api/couples/accept` 启用
> **内置内存限流**（固定窗口，按 IP+路径），**60 秒内最多 30 次**，超出返回
> `429 RATE_LIMITED`（`{ code: "RATE_LIMITED", message: "请求过于频繁，请稍后再试" }`）。
> 无第三方依赖；进程重启计数清零，多实例不共享，仅作第一道防线。

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

微信小程序登录（生产登录路径）。客户端用 `wx.login` 拿到 `code` 后调用本接口。

请求体：

```json
{ "code": "<wx.login code>", "nickname": "小明", "avatarUrl": "https://...", "gender": "male" }
```

- `code` 必填（1–200 字符）；`nickname`（1–30 字符）/`avatarUrl`（合法 URL）/`gender`
  （`unknown`/`male`/`female`）可选，用于首次登录补充资料。
- 服务端使用**服务端 AppID/AppSecret** 调微信 `code2session` 换取会话，按 `openid` upsert 用户
  （微信返回 `unionid` 时一并落库），签发本服务 JWT。
- **`AppSecret` 仅从环境变量读取，绝不写死、绝不返回前端；`openid`/`unionid`/`session_key`
  均不返回前端，`session_key` 仅服务端短暂使用、不入可读日志。**
- 服务端未配置 `WECHAT_APP_ID/SECRET` 时（如开发环境）返回 `501 WECHAT_NOT_CONFIGURED`；
  微信侧失败返回 `401 WECHAT_<errcode>`（或 `401 WECHAT_LOGIN_FAILED`）；
  上游网络失败 `502 WECHAT_UPSTREAM_ERROR`。

成功响应同 `mock-login`：`{ token, user }`（`user` 仅含公开字段，详见下文用户字段说明）。

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

# Phase 5–10 业务接口

> 以下接口**全部需鉴权**（`Authorization: Bearer <token>`），并要求当前用户已绑定情侣
> （否则 `404 NO_ACTIVE_COUPLE`）。所有查询按 `coupleId` 隔离；不属于本情侣或已软删除的
> 资源一律返回 `404 NOT_FOUND`。经纬度在响应中转为数字。

## Places（地点）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/places` | 新建地点（title、latitude、longitude 必填；placeType/visibility 可选） |
| GET | `/api/places` | 列表，可选 `?placeType=`、`?city=`（按城市模糊匹配）、`?year=`（4 位年份，按 `visitedAt` 自然年过滤） |
| GET | `/api/places/:id` | 详情 |
| PATCH | `/api/places/:id` | 更新 |
| DELETE | `/api/places/:id` | 软删除 |

```json
{ "success": true, "data": { "place": { "id": "...", "title": "初遇咖啡", "latitude": 31.2304, "longitude": 121.4737, "placeType": "visited", "visibility": "couple" } } }
```

### 地点投票（PlaceVote）

情侣双方对共享地点投票（想去 `want` / 一般 `meh` / 不想去 `no`），用于「想去清单」决策。
每人每地点一票，可改票（按 `(placeId, userId)` upsert）。先校验地点属于本情侣且未软删除，否则 `404 PLACE_NOT_FOUND`。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/places/:id/vote` | 投票/改票（`vote` 必填，枚举 `want`/`meh`/`no`） |
| GET | `/api/places/:id/votes` | 读取该地点投票汇总 |

`POST` 请求体：`{ "vote": "want" }`（须为 `want`/`meh`/`no` 之一，否则 `400 VALIDATION_ERROR`）。

两个接口均返回票数汇总 `tally`：`want`/`meh`/`no` 为各档票数，`mine` 为当前用户自己的投票（未投为 `null`）：

```json
{ "success": true, "data": { "tally": { "want": 2, "meh": 0, "no": 1, "mine": "want" } } }
```

## Memories（回忆）

关联某个 Place（`placeId` 必填，且须属于本情侣，否则 `404 PLACE_NOT_FOUND`）。列表/详情内联未删除的 `media`。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/memories` | 新建（placeId、title 必填；含可选 `tags`；标题/正文过内容安全审核，未过返回 `400 CONTENT_REJECTED`） |
| GET | `/api/memories` | 列表（游标分页），可选 `?placeId=`、`?tag=`（按标签模糊匹配）、`?limit=`（默认 20，最大 100）、`?cursor=` |
| GET | `/api/memories/:id` | 详情（含 media） |
| PATCH | `/api/memories/:id` | 更新 title/content/mood/memoryDate/visibility/tags（同样过内容安全审核） |
| DELETE | `/api/memories/:id` | 软删除 |

### 列表分页（游标）

`GET /api/memories` 按 `createdAt` 倒序（`id` 倒序兜底）做**游标分页**：响应 `data` 中除
`memories` 外含 `nextCursor`（`string | null`）；非 `null` 时把它作为下一页的 `?cursor=` 传入，
为 `null` 表示没有更多。`placeId`/`tag` 过滤参数跨页保持一致即可。

```json
{ "success": true, "data": { "memories": [ { "id": "..." } ], "nextCursor": "cmqxxx..." } }
```

### 回忆标签（tags）

回忆支持打标签，便于筛选与统计。

- `POST` / `PATCH` 接受 `tags: string[]`（数组，**最多 8 个**，每个 **1–20 字符**）；
  服务端去空白、去重后以**逗号拼接**存入 `Memory.tags`（字符串）字段。
- 响应中回忆对象包含 `tags` 字段（逗号拼接的字符串；无标签时为 `null`）。
- `GET /api/memories?tag=<t>`：按标签**子串模糊匹配**过滤（对 `tags` 字段做 `contains`）。
- `PATCH` 时传 `tags: []` 即清空标签；不传 `tags` 则不改动既有标签。

```json
{ "success": true, "data": { "memory": { "id": "...", "title": "第一次约会", "tags": "约会,海边,纪念日", "visibility": "couple" } } }
```

## Media（照片元数据 + 签名直传）

> `cos`/`oss`/`local` 模式下照片走**客户端直传对象存储**：服务端只签发短时上传凭证并保存元数据，
> **API 不中转文件字节**。`disk` 模式（私用自托管）例外：字节经签名 PUT 写入 API 服务器磁盘，见下文。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/media/upload-credential` | 签发图片上传凭证（mimeType 必填；限图片类型、≤10MB） |
| PUT | `/api/media/upload?key&exp&sig` | **仅 disk 模式**：接收原始图片字节（HMAC 短时签名鉴权，非 JWT） |
| GET | `/files/*` | **仅 disk 模式**：读取已存图片（objectKey 不可猜；已删除照片返回 404） |
| GET | `/thumbs/*` | **仅 disk 模式**：读取缩略图（最长边 640px JPEG；列表/卡片场景用） |
| POST | `/api/media` | 新建（memoryId、fileUrl、objectKey、mimeType 必填；须属于本情侣的 memory） |
| GET | `/api/media?memoryId=...` | 某回忆的照片列表（按 sortOrder 升序） |
| DELETE | `/api/media/:id` | 软删除 |

### POST /api/media/upload-credential

需鉴权。为一张待上传图片签发上传凭证。基于纯 Node `crypto` 实现签名，**无新增依赖、无厂商 SDK**：
腾讯云 COS（签名 V5，HMAC-SHA1）与阿里云 OSS（签名 V1，HMAC-SHA1 + base64）均已支持，
按服务端 `STORAGE_PROVIDER` 选择。

请求体：

```json
{ "mimeType": "image/jpeg" }
```

- `mimeType` 必填，仅允许图片类型：`image/jpeg`、`image/png`、`image/webp`、`image/gif`；
  其他类型返回 `415 UNSUPPORTED_MEDIA_TYPE`。

响应：

```json
{
  "success": true,
  "data": {
    "credential": {
      "provider": "cos",
      "objectKey": "couples/<coupleId>/<uuid>.jpg",
      "fileUrl": "https://<bucket>.cos.<region>.myqcloud.com/<objectKey>",
      "uploadUrl": "https://<bucket>.cos.<region>.myqcloud.com/<objectKey>?q-sign-algorithm=...",
      "maxBytes": 10485760,
      "mimeType": "image/jpeg"
    }
  }
}
```

- `provider=cos`（腾讯云）：`uploadUrl` 为**预签名 PUT 直传地址**，有效期约 **10 分钟**，过期需重新签发。
- `provider=oss`（阿里云）：`uploadUrl` 同为**预签名 PUT 直传地址**（约 **10 分钟**）。
  **注意**：OSS 将 `Content-Type` 纳入签名，客户端 `PUT` 时**必须发送与签名时一致的 `Content-Type`**
  （即本接口请求体里的 `mimeType`），否则对象存储侧会拒绝（签名不匹配）。小程序端已按此发送。
- `provider=local`：仅开发用，`uploadUrl` 为 `null`（本地不提供直传地址，仅返回元数据占位）。
- `provider=disk`（私用自托管）：`uploadUrl` 指向本服务 `PUT /api/media/upload?key&exp&sig`
  （HMAC-SHA256 查询串签名，**10 分钟有效**，免登录头）；`fileUrl` 为 `GET /files/<objectKey>`。
  需配置 `STORAGE_PUBLIC_BASE_URL`（缺失返回 `500 STORAGE_NOT_CONFIGURED`）、可选 `STORAGE_DISK_DIR`
  指定落盘目录。上传端校验：签名无效/过期 `403 UPLOAD_FORBIDDEN`、对象键非法 `400 BAD_OBJECT_KEY`、
  空内容 `400 EMPTY_BODY`、魔数与图片类型不符 `400 INVALID_IMAGE`、重复上传同一对象键
  `409 ALREADY_UPLOADED`、超限 `413 FILE_TOO_LARGE`。读取端：`Cache-Control: private`，
  软删除的照片立即 404（disk 模式下删除元数据时同时尽力删除磁盘文件与缩略图）。
  **缩略图**：`GET /thumbs/<objectKey>` 返回最长边 640px 的 JPEG（sharp 生成，EXIF 方向已矫正、
  透明铺白）；上传后异步预生成，历史照片首次请求时惰性生成；原图缺失/不可解码时回退返回原图。
  小程序端约定：列表/卡片用 `/thumbs/`，详情大图与 `wx.previewImage` 用 `/files/` 原图
  （`utils/image.js` 的 `thumbUrl()`，非 disk 链接原样返回）。
- `maxBytes` 上限 **10MB（10485760）**；超限由对象存储侧/后续校验拒绝。
- **存储访问密钥 `STORAGE_ACCESS_KEY_ID` / `STORAGE_ACCESS_KEY_SECRET` 仅从服务端环境变量读取，
  绝不返回前端、绝不写入日志。**

### 两步上传流程

1. `POST /api/media/upload-credential { mimeType }` → 取回 `credential`。
2. `cos` 模式：客户端将原始文件字节通过 **HTTP `PUT` 直传到 `uploadUrl`**（约 10 分钟内有效），
   直传成功后再 `POST /api/media`（带 `memoryId`、`fileUrl`、`objectKey`、`mimeType` 等）登记元数据。
   `local` 模式无 `uploadUrl`，直接用返回的 `objectKey/fileUrl` 调 `POST /api/media`。

> 文件字节**不经过 API**，由客户端直传对象存储；API 仅负责签名与元数据登记。

## Checkins（位置打卡）

> **隐私默认**：不做后台定位、仅用户主动打卡；`shareScope` 默认 `self`。伴侣位置仅在打卡
> `shareScope` 为 `partner`/`memory` 且未过期时可见。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/checkins` | 打卡（latitude/longitude 必填；shareScope 默认 self；shareTtlMinutes 决定 expiresAt——`partner` 未传时**默认 120 分钟**，`memory` 不传则不过期） |
| GET | `/api/checkins` | 我自己的打卡（倒序，≤50） |
| GET | `/api/checkins/partner-latest` | 伴侣最近一次**有效共享**位置 + 直线距离（米）；无则均为 null |
| GET | `/api/co-checkin` | 共同打卡候选检测（见下）；**不返回任何伴侣坐标** |
| DELETE | `/api/checkins/:id` | 软删除自己的打卡 |

```json
{ "success": true, "data": { "checkin": { "id": "...", "shareScope": "partner", "expiresAt": "<ISO>" }, "distanceMeters": 1234.56 } }
```

### GET /api/co-checkin

需鉴权、按 `coupleId` 隔离。在**双方各自最近若干条打卡**（每人取最近 20 条）中两两比对，
找出满足条件且最近的一对，判断是否构成「共同打卡」候选，用于前端提示「生成共同回忆」。

判定条件（两者同时满足）：直线距离 **≤ 200m** 且时间差 **≤ 180min**。

**可见性过滤**：伴侣一侧只取 `shareScope` 为 `partner`/`memory` **且未过期**的打卡参与匹配；
`shareScope='self'`（默认）或已过期的打卡绝不参与，避免私密打卡通过距离/时间差被旁路推断。

**隐私**：本接口**仅读取双方已存在的、用户主动发起的打卡记录**做匹配，**不做后台持续定位、
不发起任何额外定位或上报**。响应**绝不返回伴侣的原始经纬度或身份标识**，仅返回粗粒度距离
（米，四舍五入）、时间差（分钟）与双方各自的 `checkinId`；仅当任一打卡关联了**地点**时，
附带该地点的 `placeId`/`placeTitle`（仍不含坐标）。

尚未绑定第二人、或无满足条件的打卡对时，`candidate` 为 `null`。

```json
{
  "success": true,
  "data": {
    "candidate": {
      "placeId": "...",
      "placeTitle": "初遇咖啡",
      "distanceMeters": 35,
      "withinMinutes": 12,
      "myCheckinId": "...",
      "partnerCheckinId": "..."
    }
  }
}
```

> 无候选时：`{ "success": true, "data": { "candidate": null } }`。`placeId`/`placeTitle`
> 在两条打卡均未关联地点时为 `null`。

## Tasks（任务）

状态机：`pending →(assignee accept)→ accepted →(assignee complete)→ completed →(creator confirm)→ confirmed`；
`pending →(assignee reject)→ rejected`；`pending|accepted →(creator cancel)→ cancelled`。
非授权操作人 `403 FORBIDDEN`，非法流转 `409 INVALID_TASK_TRANSITION`。`confirm` 时在**事务**内给
assignee 记一次任务积分（points>0），凭流转保证只发一次。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/tasks` | 新建（title、assigneeId=伴侣；description/points/dueAt/relatedPlaceId 可选）。assignee 必须是伴侣，否则 `400 INVALID_ASSIGNEE` |
| GET | `/api/tasks` | 列表，可选 `?status=`（pending/accepted/rejected/completed/confirmed/cancelled） |
| GET | `/api/tasks/:id` | 详情 |
| POST | `/api/tasks/:id/accept` | assignee：pending → accepted |
| POST | `/api/tasks/:id/reject` | assignee：pending → rejected |
| POST | `/api/tasks/:id/complete` | assignee：accepted → completed |
| POST | `/api/tasks/:id/confirm` | creator：completed → confirmed，事务内给 assignee 发积分 |
| POST | `/api/tasks/:id/cancel` | creator：pending/accepted → cancelled |

> 状态流转均为独立的 `POST` 端点（不是通用的 `/:action`）。

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
| POST | `/api/shop/items` | 新建商品（title、pricePoints、stock 必填；description/status 可选） |
| GET | `/api/shop/items` | 商品列表，可选 `?status=`（active/inactive） |
| GET | `/api/shop/items/:id` | 商品详情 |
| PATCH | `/api/shop/items/:id` | 更新商品 |
| DELETE | `/api/shop/items/:id` | 软删除商品 |
| POST | `/api/shop/items/:id/redeem` | 兑换：校验库存>0、余额≥价格；扣库存、记负分、生成 unused 兑换；返回 `{ redemption, balance }` |
| GET | `/api/shop/redemptions` | 我的背包（我购买的兑换记录，倒序） |
| POST | `/api/shop/redemptions/:id/use` | 标记已用（unused→used，写 usedAt） |
| POST | `/api/shop/redemptions/:id/cancel` | 取消并退分、回补库存（unused→cancelled） |

兑换错误：`404 ITEM_UNAVAILABLE`、`409 OUT_OF_STOCK`、`409 INSUFFICIENT_POINTS`。
核销/取消错误：`404 NOT_FOUND`、`409 REDEMPTION_NOT_USABLE`、`409 REDEMPTION_NOT_CANCELLABLE`。

## Events（日程/纪念日）

`daysUntil` 以今天 00:00（本地）为基准，负数表示已过。

事件类型 `eventType`：`anniversary|date|countdown|plan`。响应附带 `daysUntil` 视图字段。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/events` | 新建（title、eventDate 必填；eventType/repeatRule/relatedPlaceId 可选） |
| GET | `/api/events` | 列表，按 eventDate 升序，可选 `?eventType=` |
| GET | `/api/events/:id` | 详情 |
| PATCH | `/api/events/:id` | 更新 |
| DELETE | `/api/events/:id` | 软删除 |

## Plans（计划转回忆）

把一个 `placeType ∈ {wishlist, plan}` 的地点标记为已到访，并在**同一事务**内生成一条回忆，
实现「计划 → 回忆」流转。

### PATCH /api/plans/:id/complete

需鉴权、按 `coupleId` 隔离。`:id` 为待完成的计划/想去地点的 id。

请求体：

```json
{ "title": "终于来了", "content": "今天一起去了", "mood": "happy", "memoryDate": "<ISO8601>" }
```

- `title` 必填（1–100）；`content`/`mood` 可选；`memoryDate` 可选（ISO8601 日期时间）。

事务内：地点 `placeType` 置为 `visited` 并写 `visitedAt`，新建回忆 `visibility=couple`。
地点不存在/越权/已软删除，或其 `placeType` 不在 `{wishlist, plan}` → `404 PLAN_NOT_FOUND`。

```json
{ "success": true, "data": { "place": { "id": "...", "placeType": "visited", "visitedAt": "<ISO8601>" }, "memory": { "id": "...", "title": "终于来了", "visibility": "couple" } } }
```

## Search（搜索）

### GET /api/search?q=

需鉴权、按 `coupleId` 隔离。按关键词在地点（标题/地址/城市）与回忆（标题/内容）中检索，
各取最多 50 条（按 `createdAt` 倒序），均过滤已软删除项。`q` 为空或缺失时返回空数组。

```json
{
  "success": true,
  "data": {
    "places": [
      { "id": "...", "title": "初遇咖啡", "address": "...", "latitude": 31.2304, "longitude": 121.4737, "city": "上海", "placeType": "visited", "visibility": "couple" }
    ],
    "memories": [
      { "id": "...", "title": "第一次约会", "content": "...", "mood": "happy", "memoryDate": "<ISO8601>", "placeId": "..." }
    ]
  }
}
```

## Dashboard（首页聚合）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/dashboard` | `daysTogether`、`pointsBalance`、`recentMemories`(5)、`pendingTasks`(计数)、`upcomingEvents`(5) |

## Review（月度 / 年度回顾）

> **需鉴权**、按 `coupleId` 隔离，要求已绑定情侣。聚合某个自然月 / 自然年内的回忆、地点、城市、
> 省份、照片与标签统计，用于回顾页 / 分享海报。读取一律过滤已软删除项。

### GET /api/review

查询参数：

- `period`：`month`（默认）或 `year`。
- `value`：`month` 时形如 `YYYY-MM`、`year` 时形如 `YYYY`；缺省取**当前**自然月 / 自然年。
  格式不符返回 `400 VALIDATION_ERROR`。

区间为半开区间 `[start, end)`（UTC）。回忆类统计以 `Memory.memoryDate`（为空回落 `createdAt`）
落在区间内为准；地点类统计以 `Place.visitedAt`（为空回落 `createdAt`）落在区间内为准。

响应字段：

- `period` / `value`：回显规范化后的周期与取值；`range`：`{ start, end }`。
- `memoryCount` / `placeCount`：区间内回忆数 / 地点数。
- `cityCount` / `provinceCount`：区间内地点去重后的城市数 / 省份数（按 adcode）。
- `photoCount`：区间内回忆所关联、未删除的照片数。
- `topTags`：标签词频 Top 5，`[{ tag, count }]`（对回忆 `tags` 逗号拆分统计）。
- `recentMemories`：最近最多 6 条回忆，`[{ id, title, memoryDate }]`（`memoryDate` 为空回落 `createdAt`）。

```json
{
  "success": true,
  "data": {
    "period": "month",
    "value": "2026-06",
    "range": { "start": "2026-06-01T00:00:00.000Z", "end": "2026-07-01T00:00:00.000Z" },
    "memoryCount": 4,
    "placeCount": 3,
    "cityCount": 2,
    "provinceCount": 1,
    "photoCount": 9,
    "topTags": [ { "tag": "约会", "count": 3 }, { "tag": "海边", "count": 1 } ],
    "recentMemories": [ { "id": "...", "title": "第一次约会", "memoryDate": "<ISO8601>" } ]
  }
}
```

## 情感互动（今日心情 / 情侣问答）

> 均**需鉴权**、按 `coupleId` 隔离，要求已绑定情侣（否则 `404 NO_ACTIVE_COUPLE`）。
> 「今日」均以服务端本地日期 `YYYY-MM-DD` 为界。

### 今日心情（Mood）

每人每天一条心情，可多次提交以覆盖当天（按 `(coupleId, userId, day)` upsert）。
心情枚举 `mood ∈ happy|miss|tired|angry|hug|calm`。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/moods` | upsert 今天的心情（`mood` 必填；`note` 可选，≤200） |
| GET | `/api/moods/today` | 今日双方心情 `{ mine, partner }` |

`POST /api/moods` 请求体：

```json
{ "mood": "happy", "note": "今天很开心" }
```

- `mood` 必填，须为枚举值之一，否则 `400 VALIDATION_ERROR`；`note` 可选（≤200）。

`GET /api/moods/today` 响应（双方各自当天最新心情；未提交方为 `null`）：

```json
{
  "success": true,
  "data": {
    "mine": { "mood": "happy", "note": "今天很开心", "day": "2026-06-04", "updatedAt": "<ISO8601>" },
    "partner": { "mood": "miss", "note": null, "day": "2026-06-04", "updatedAt": "<ISO8601>" }
  }
}
```

> 心情属当天即时状态，**任一方提交后伴侣即可见**（与问答不同，无「双方完成才互看」门槛）。

### 情侣问答（QA）

每天一道共同问题（`questionKey` 标识）。**双方都回答后才能互看彼此答案**；
在此之前**绝不返回伴侣答案**，仅暴露「伴侣是否已回答」的布尔位。
每人每题一条答案，可覆盖（按 `(coupleId, userId, questionKey)` upsert）。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/qa/today` | 今日问题与作答状态 |
| POST | `/api/qa/today` | 提交/覆盖我对今日问题的答案（`answer` 必填） |

`POST /api/qa/today` 请求体：

```json
{ "answer": "想和你一起去看海" }
```

- `answer` 必填（1–500）。提交后若双方均已作答，则 `GET` 即可揭示双方答案。

`GET /api/qa/today` 响应：

```json
{
  "success": true,
  "data": {
    "question": { "key": "2026-06-04", "text": "今天最想对 TA 说的一句话？" },
    "mineAnswer": "想和你一起去看海",
    "partnerAnswered": true,
    "revealed": true,
    "answers": {
      "mine": "想和你一起去看海",
      "partner": "也想和你去爬山"
    }
  }
}
```

- `mineAnswer`：我自己的答案（已答则为字符串，未答为 `null`）——我自己的答案任何时候都可见。
- `partnerAnswered`：伴侣是否已回答（布尔），仅用于前端提示「等待对方作答」。
- `revealed`：是否双方均已作答（即可互看）。**仅当 `revealed=true` 时才返回 `answers`**。
- `answers`：**仅在双方都已回答（`revealed=true`）时出现**，含 `mine`/`partner` 双方答案；
  否则该字段**不返回**，伴侣答案**绝不泄露**。

> 隐私/产品约束：伴侣答案**只有在双方都回答后**才可见。未达成时响应里既无 `answers`、
> 也不含任何伴侣答案文本，只通过 `partnerAnswered` 暴露「对方是否已答」这一布尔位。

## Privacy Consents（隐私授权，按用户）

`PrivacyConsent` 仅按 `userId` 隔离（与情侣无关），**追加写**，每次同意/撤销新增一行。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/privacy/consents` | 我的授权记录（倒序） |
| POST | `/api/privacy/consents` | 记录授权/撤销（consentType、version、agreed）；**撤销带联动**（见下） |

**行为即授权**：用户主动发起共享类动作时服务端自动补记同意台账（`version=action-implied-v1`，
最新状态已是同意时不重复写）——向伴侣共享打卡 / 开启临时位置共享 → `location`；
显式开启公开地图 → `public_share`。

**撤销联动**：`agreed=false` 时立即产生实际效果——撤销 `location` 会停止本人所有生效中的
临时位置共享会话并清掉伴侣可见的最新位置缓存；撤销 `public_share` 会关闭本情侣所有已开启的
公开地图分享。

## 数据导出

### GET /api/export

需鉴权、按 `coupleId` 隔离。将**当前情侣关系**的全部数据一次性导出为 JSON，用于备份/数据可携。
小程序 me 页「导出数据」即调用本接口并复制 JSON 到剪贴板。

**隐私**：仅导出当前用户所属情侣（`coupleId`）的数据，**绝不跨情侣**；`users` 仅含双方的
**公开字段** `id`/`nickname`/`avatarUrl`，**绝不含 openid/unionid/sessionKey** 等身份敏感字段，
也不含任何应用密钥。隐私授权记录（`privacyConsents`）按当前 `userId` 维度导出。

导出内容（均按 `coupleId` 过滤、含软删除列的模型已排除软删除项）：

```json
{
  "success": true,
  "data": {
    "export": {
      "couple": { "id": "...", "status": "active", "togetherAt": "<ISO8601>", "createdAt": "<ISO8601>" },
      "users": [ { "id": "...", "nickname": "小红", "avatarUrl": null } ],
      "places": [],
      "memories": [],
      "media": [],
      "checkins": [],
      "tasks": [],
      "pointLedger": [],
      "shopItems": [],
      "redemptions": [],
      "events": [],
      "privacyConsents": []
    }
  }
}
```

> `users` 在尚未绑定第二人时仅含 1 人。`places`/`checkins` 的经纬度已转为数字。

## Notifications（订阅消息，真实下发）

> **真实下发已接通**：`/subscribe` 持久化一条 `ReminderSubscription`（订阅记录）；真正的微信
> `subscribeMessage` 服务端下发在提醒时间到达后由 `/run-due` 触发。
> 小程序侧通过 `wx.requestSubscribeMessage` 由用户**主动授权**后再调用 `/subscribe`（用户知情同意，opt-in）。
> **`AppSecret` 仅后端环境变量**：服务端用 `WECHAT_APP_ID/SECRET` 换取 `access_token`（内存缓存、绝不返回前端、绝不入可读日志）再下发。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/notifications/subscribe` | 受理订阅并**落库** `ReminderSubscription`（`templateId` 必填 1–100；`eventId`、`remindAt` 可选）。返回 `{ accepted: true, templateId }` |
| GET | `/api/notifications/templates` | 返回提醒类模板文案占位列表 `{ templates: [{ key, title, desc }] }` |
| POST | `/api/notifications/run-due` | 下发本情侣**到期**（`remindAt <= now` 且未发送）的订阅消息，返回 `{ sent, failed }` |

`POST /api/notifications/subscribe` 请求体：

```json
{ "templateId": "...", "eventId": "...", "remindAt": "<ISO8601>" }
```

- `templateId` 必填（1–100）；`eventId` 可选；`remindAt` 可选（ISO8601；缺省时该订阅无到期时间，不会被 `/run-due` 选中）。

```json
{ "success": true, "data": { "accepted": true, "templateId": "..." } }
```

`GET /api/notifications/templates` 响应：

```json
{
  "success": true,
  "data": {
    "templates": [
      { "key": "anniversary", "title": "纪念日提醒", "desc": "在重要日子前提醒你们" },
      { "key": "plan", "title": "约会计划提醒", "desc": "计划当天提醒" }
    ]
  }
}
```

`POST /api/notifications/run-due`：取本情侣 `remindAt <= now` 且 `sentAt` 为空的订阅逐条下发，
成功后写 `sentAt`（保证只发一次）；单条失败不影响其余。无 `openid` 的用户记为 `failed`。

```json
{ "success": true, "data": { "sent": 2, "failed": 0 } }
```

> **开发安全降级**：服务端未配置 `WECHAT_APP_ID` / `WECHAT_APP_SECRET` 时，`/run-due` **不进入下发循环**，
> 直接返回 `{ sent: 0, failed: 0, configured: false }`（no-op），便于开发环境调用而不触达微信。
> 微信上游失败返回 `502 WECHAT_UPSTREAM_ERROR` / `WECHAT_PUSH_FAILED`（错误仅含微信 `errmsg`，不含密钥）。

## Public Share（公开分享骨架）

> **骨架**：仅维护分享开关与唯一 `shareCode`，**不暴露任何坐标**。公开地图内容与坐标脱敏
> （家/学校/工作不外泄）在 **Phase 10** 实现；产品层默认关闭。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/public-shares` | 创建分享记录（title 必填；**默认 disabled，隐私优先，需调用 `/enable` 显式开启**；shareCode 12 位 hex，冲突重试；title 过内容安全审核） |
| GET | `/api/public-shares` | 列表（倒序） |
| POST | `/api/public-shares/:id/enable` | 开启分享（enabled=true，清空 disabledAt） |
| POST | `/api/public-shares/:id/disable` | 关闭分享（enabled=false，记 disabledAt） |

操作不存在/非本情侣的记录返回 `404 SHARE_NOT_FOUND`；分享码分配失败 `500 SHARE_CODE_GENERATION_FAILED`。

### GET /api/public-map/:shareCode

**公开接口，免登录、只读。** 按 `shareCode` 找到生效的公开分享，返回该情侣 `visibility=public`
的地点与回忆。**坐标统一模糊化**至 3 位小数（约 110m），**绝不暴露**精确的家/学校/工作坐标，
也不返回 openid、详细地址、定位精度等任何超出约定字段的数据。web-share 应用即读取本接口渲染公开地图。

分享不存在或已停用（`enabled=false`）一律返回 `404 PUBLIC_SHARE_NOT_FOUND`。

响应：

```json
{
  "success": true,
  "data": {
    "share": { "title": "我们的足迹" },
    "places": [
      { "id": "...", "title": "初遇咖啡", "placeType": "visited", "city": "上海", "latitude": 31.23, "longitude": 121.474 }
    ],
    "memories": [
      { "id": "...", "title": "第一次约会", "memoryDate": "<ISO8601>", "placeId": "..." }
    ]
  }
}
```

> 经纬度为模糊化后的低精度值；列表仅含公开内容，私有/伴侣可见内容不会进入公开范围。

## AI 文案（差异化文案生成）

> 均**需鉴权**（仅要求已登录，不涉及具体情侣资源，故不做 `coupleId` 越权校验）。
> 底层走 OpenAI 兼容 LLM（服务端 env 配置）；**未配置 AI Key 时自动回落本地模板**（无任何外部调用），
> 开发环境亦可正常使用。响应统一带 `source` 字段：`llm`（模型生成）或 `template`（本地模板兜底）。
> **AI Key 仅后端环境变量读取**（`AI_API_KEY` / `AI_API_BASE` / `AI_MODEL`），绝不返回前端、绝不入日志。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/ai/memory-copy` | 回忆文案：据地点/标签/心情/日期生成标题与小故事 |
| POST | `/api/ai/share-caption` | 分享配文：据地点/标签/数量生成一句话分享文案 |
| POST | `/api/ai/review-summary` | 回顾总结：据回顾统计生成一段温暖小结 |

### POST /api/ai/memory-copy

请求体（均可选）：

```json
{ "placeTitle": "初遇咖啡", "tags": ["约会", "海边"], "mood": "happy", "date": "2026-06-04" }
```

- `placeTitle`（≤100）、`mood`（≤50）、`date`（≤50）可选；`tags` 可选（数组，≤8 个，每个 1–50 字符）。

```json
{ "success": true, "data": { "title": "...", "story": "...", "source": "template" } }
```

### POST /api/ai/share-caption

请求体（均可选）：

```json
{ "placeTitle": "初遇咖啡", "tags": ["约会"], "count": 12 }
```

- `placeTitle`（≤100）、`tags`（≤8 个，每个 1–50 字符）、`count`（整数 0–100000）可选。

```json
{ "success": true, "data": { "caption": "...", "source": "llm" } }
```

### POST /api/ai/review-summary

请求体（统计数据，对应 `GET /api/review` 输出）：

```json
{ "memoryCount": 4, "placeCount": 3, "cityCount": 2, "provinceCount": 1, "photoCount": 9, "topTags": ["约会", "海边"], "period": "month" }
```

- `memoryCount`/`placeCount`/`cityCount`/`provinceCount`/`photoCount` 必填（整数 0–1000000）；
  `topTags`（≤8 个，每个 1–50 字符）、`period`（≤50）可选。

```json
{ "success": true, "data": { "summary": "...", "source": "template" } }
```

## Love Map 档案（关于 TA 的小事实 + 问答历史）

> 均**需鉴权**、按 `coupleId` 隔离，要求已绑定情侣（否则 `404 NO_ACTIVE_COUPLE`）。
> 「问答历史」**仅包含双方都回答过**的题目（与情侣问答的「双方完成才互看」一致）。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/profile` | 档案总览：我的/对方的小事实 + 已揭晓的问答历史 |
| POST | `/api/profile/fact` | 新增/更新一条「关于我」的小事实（按 `key` upsert） |
| DELETE | `/api/profile/fact/:id` | 删除自己的一条小事实（非本人/不存在 → `404 NOT_FOUND`） |

`GET /api/profile` 响应：`mine`/`partner` 为双方各自的小事实列表（每项 `{id,key,value}`）；
`qaHistory` 为双方均已作答的问答（最多 30 条，按最近作答倒序，每项
`{questionKey, mineAnswer, partnerAnswer}`）。

```json
{
  "success": true,
  "data": {
    "mine": [ { "id": "...", "key": "favorite_food", "value": "火锅" } ],
    "partner": [ { "id": "...", "key": "favorite_food", "value": "寿司" } ],
    "qaHistory": [ { "questionKey": "2026-06-03", "mineAnswer": "想去看海", "partnerAnswer": "想去爬山" } ]
  }
}
```

`POST /api/profile/fact` 请求体：`{ "key": "favorite_food", "value": "火锅" }`
（`key` 必填 1–40，`value` 必填 1–200；按 `(coupleId, userId, key)` upsert）。

```json
{ "success": true, "data": { "fact": { "id": "...", "key": "favorite_food", "value": "火锅" } } }
```

## 意见反馈（运营）

> 均**需鉴权**。反馈按 `userId` 维度记录；列表仅返回当前用户自己提交的反馈（越权隔离）。
> 提交时尽力填充当前情侣关系 `coupleId`，**未绑定情侣也可提交**（`coupleId` 为 `null`）。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/feedback` | 提交一条反馈（`content` 必填 1–1000；`contact` 可选 ≤100） |
| GET | `/api/feedback` | 我提交过的反馈列表（倒序，≤50） |

`POST /api/feedback` 请求体：`{ "content": "希望支持导出 PDF", "contact": "微信号 xxx" }`。

```json
{ "success": true, "data": { "feedback": { "id": "...", "createdAt": "<ISO8601>" } } }
```

---

## Account（账号注销）

### POST /api/account/delete

需鉴权。**不可逆**的账号注销（《个人信息保护法》要求），事务内完成：

- 当前生效的情侣关系置为 `unbound`（解绑，不删除对方数据）；
- 用户软删除（置 `deletedAt`）并**匿名化**：昵称/头像清空，`openid`/`unionid` 置空
  （同一微信号后续可重新注册）；
- 情侣共享内容（地点/回忆/照片元数据等）**保留**，归属仍是这段关系；
- 注销后原 JWT **立即失效**（鉴权层校验用户未被软删除），所有后续请求返回 `401 UNAUTHORIZED`。

请求体为空对象 `{}`。响应：`{ "success": true, "data": { "ok": true } }`。
用户不存在/已注销返回 `404 USER_NOT_FOUND`。

---

## 差异说明（与产品/参考清单的有意差异）

以下能力在产品设想中存在，但**有意**未实现为独立路由，而是复用现有端点或留待后续阶段：

- **时间线（timeline）**：没有专用的 `GET /api/timeline`。回忆时间线由 `GET /api/memories`
  提供（按 `createdAt` 倒序），客户端按 `memoryDate`/`createdAt` 自行编排。
- **约会计划（plan）**：没有独立的 Plan 资源用于「创建计划」——计划仍以地点
  `placeType=plan`（`/api/places`）与事件 `eventType=plan`（`/api/events`）两处建模；
  **但「计划转回忆」已实现**为 `PATCH /api/plans/:id/complete`（见上）。
- **公开只读地图**：`GET /api/public-map/:shareCode` **已实现**（免登录、只读、坐标模糊化，见上），
  web-share 应用据此渲染公开地图。
- **真实对象存储直传签名**：腾讯云 COS 与阿里云 OSS 签名直传**均已实现**（纯 Node `crypto`：
  COS 签名 V5 / OSS 签名 V1，无新增依赖、无厂商 SDK）。`cos`/`oss` provider 均返回约 10 分钟
  有效的预签名 PUT `uploadUrl`；开发用 `local` provider 返回 `uploadUrl=null`。OSS 因 `Content-Type`
  参与签名，客户端 `PUT` 必须发送一致的 `Content-Type`。详见上「Media（照片元数据 + 签名直传）」。

---

## 常见错误码索引

| HTTP | code | 触发场景 |
|---|---|---|
| 400 | `CONTENT_REJECTED` | UGC 内容安全审核未通过（POST/PATCH `/api/memories`、POST `/api/public-shares`、POST `/api/feedback`；微信未配置时审核直接放行） |
| 400 | `BAD_OBJECT_KEY` / `EMPTY_BODY` / `INVALID_IMAGE` | disk 上传：对象键非法 / 空内容 / 文件魔数与图片类型不符 |
| 401 | `UNAUTHORIZED` | 缺失/无效令牌；账号已注销的令牌也立即失效 |
| 403 | `MOCK_LOGIN_DISABLED` | 生产环境调用 mock 登录（除非显式 `MOCK_LOGIN_ENABLED=true`） |
| 403 | `FORBIDDEN` | 非授权操作人（任务流转等） |
| 403 | `UPLOAD_FORBIDDEN` | disk 上传：签名无效或已过期 |
| 404 | `NOT_FOUND` | 资源不存在/越权/已软删除；未匹配路由 |
| 404 | `NO_ACTIVE_COUPLE` | 未绑定情侣却访问情侣资源 |
| 404 | `PLAN_NOT_FOUND` | 计划转回忆：地点不存在/越权，或 placeType 不在 wishlist/plan |
| 404 | `PUBLIC_SHARE_NOT_FOUND` | 公开地图：shareCode 不存在或分享已停用 |
| 409 | `ALREADY_BOUND` / `ALREADY_SIGNED_IN_TODAY` | 重复绑定 / 当日重复签到 |
| 409 | `ALREADY_UPLOADED` | disk 上传：同一对象键重复上传（防签名重放） |
| 413 | `FILE_TOO_LARGE` | disk 上传：超过 10MB 上限 |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | 上传非图片类型 |
| 429 | `RATE_LIMITED` | 敏感接口（auth/邀请/接受邀请）触发内存限流（60s/30 次） |
| 429 | `TOO_MANY_ATTEMPTS` | 接受邀请码失败次数超限（每用户 1 小时 10 次，防暴力猜码） |
| 500 | `STORAGE_NOT_CONFIGURED` | 存储 provider 必需的环境变量缺失 |
| 501 | `WECHAT_NOT_CONFIGURED` / `MAP_NOT_CONFIGURED` | 微信登录 / 地图服务商未配置 |
| 502 | `MAP_UPSTREAM_ERROR` / `GEO_NOT_AVAILABLE` | 地图上游错误 / 边界数据不可用 |
| 500 | `INTERNAL_ERROR` | 未预期的服务端错误 |

---

## 地图模块（双地图 + 位置共享 + MapProvider）

所有接口均 `requireAuth`；情侣资源按 `coupleId` 越权隔离。

### 足迹地图（Footprint）
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/footprint/overview` | `{provinceCount,cityCount,placeCount,memoryCount,litProvinceIds[],litCityIds[]}`。点亮规则：地点 `placeType=visited` 或关联≥1条回忆，且有 `provinceId/cityId`(adcode)。 |
| GET | `/api/footprint/provinces/:provinceId` | `{provinceId,litCityIds[],cities:[{cityId,placeCount,memoryCount}]}` |
| GET | `/api/footprint/cities/:cityId` | `{cityId,places:[...],memories:[...]}`。`memories[]` 每项含 `id,title,memoryDate,placeId` 及富数据 `content,mood,tags[]`、`photos:string[]`（媒体 fileUrl 列表）、`cover:string\|null`（首张照片，无则 null），供地图直接展示照片+文字「立体卡片」。`places[]` 不变。 |

### 地理边界（Geo，公开边界数据）
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/geo/national` | 全国省界 GeoJSON（features.properties.adcode/name）。 |
| GET | `/api/geo/province/:adcode` | 指定省的市界 GeoJSON。本地 `assets/geo/<adcode>_full.json` 优先，缺失时在线拉取 DataV 并缓存。数据源 DataV GeoAtlas（见 THIRD_PARTY_NOTICES）。 |

### 真实地图 markers
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/map/markers?kinds=place,memory,checkin` | 聚合地点/回忆/本人打卡 marker：`{markers:[{kind,id,latitude,longitude,title,placeType?}]}`。**不**含伴侣位置。 |

### 位置共享（临时、可过期、可停止）
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/location/share-session` | `{durationMinutes:1..240}` 开启共享会话（先停掉本人旧 active 会话）。 |
| POST | `/api/location/share-session/:id/stop` | 停止共享；清缓存；推送 `partner_location_stopped`。 |
| GET | `/api/location/status` | `{mine:session|null, partner:{sharing,expiresAt}}` |
| POST | `/api/location/points` | `{sessionId,latitude,longitude,coordType?,accuracy?,speed?,heading?,clientTime?}`。会话非 active→409 `SESSION_INACTIVE`；过期→409 `SESSION_EXPIRED`。写最新位置缓存(TTL=至过期) + 推送 `partner_location_update`。**不调用逆地址**。 |
| GET | `/api/location/partner/latest` | 伴侣最近共享位置（WS 不可用时降级轮询）：`{latest|null, sharing}`。 |
| DELETE | `/api/location/points/:id` | 软删除自己的位置点。 |
| WS | `/ws/location?token=<jwt>` | 加入 `couple:{coupleId}` 房间，仅向伴侣推送 `partner_location_update/stopped/expired`。 |

### 地图服务（MapProvider，key 仅后端；无 key 兜底）
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/map/reverse-geocode?lat=&lng=` | 逆地址（带缓存）。无 key→501 `MAP_NOT_CONFIGURED`。 |
| GET | `/api/map/search-poi?keyword=&lat?=&lng?=` | POI 搜索（同关键词 300ms 去抖）。 |
| GET | `/api/map/distance?fromLat=&fromLng=&toLat=&toLng=` | 距离（Haversine 兜底，**无需 key**）。 |
| GET | `/api/map/route?fromLat=&fromLng=&toLat=&toLng=&mode?=` | 路线规划（需 key）。 |
| POST | `/api/map/coordinate-convert` | `{latitude,longitude,fromType,toType}` 坐标转换（百度 BD-09 待实现）。 |
