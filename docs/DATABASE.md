# DATABASE — love-map-mini

数据库：MySQL，ORM：Prisma。Schema：[`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma)。

## 通用约定

- **主键**：统一 `String @id @default(cuid())`，避免暴露自增序号。
- **软删除**：`deletedAt DateTime?`（业务查询需过滤 `deletedAt IS NULL`）。适用于
  User、Place、Memory、Media、Checkin、Task、ShopItem、Event。
- **越权隔离**：所有情侣资源都带 `coupleId`，便于接口层校验 `userId` + `coupleId`。
- **经纬度**：`Decimal(10,7)`（约 1cm 精度，避免浮点误差）。
- **外键**：`ON DELETE RESTRICT`，防止误删被引用数据；删除走软删除。
- **时间戳**：`createdAt` 默认 now()，`updatedAt` 自动更新（不可变的 PointLedger 仅有 createdAt）。

## 枚举

| 枚举 | 取值 |
|---|---|
| Gender | unknown / male / female |
| CoupleStatus | pending / active / unbound |
| PlaceType | visited / wishlist / plan |
| Visibility | private / couple / public |
| ShareScope | self / partner / memory |
| TaskStatus | pending / accepted / rejected / completed / confirmed / cancelled |
| PointSourceType | checkin / task / memory / signin / manual / redeem |
| ShopItemStatus | active / inactive |
| RedemptionStatus | unused / used / cancelled |
| EventType | anniversary / date / countdown / plan |
| ConsentType | location / album / camera / public_share |

## 模型（24 张表）

### User
用户。`openid` 唯一（微信登录），`unionid` 可选。`gender` 枚举，软删除。
> 关系：作为 partnerA/partnerB 的 Couple；创建的 Place/Memory/Task/ShopItem/Event；
> 上传的 Media；自己的 Checkin/PointLedger/Redemption/PrivacyConsent/PublicShare。

### Couple
情侣关系。`userAId`（发起方，必填）、`userBId`（接受方，绑定后填）、`status`、
`inviteCode`（唯一）、`inviteExpiresAt`、`togetherAt`（在一起日期）。
> 索引：userAId、userBId、status。

### Place
地点。`coupleId`、`createdById`、经纬度、城市/省/国、`category`、`placeType`、
`visibility`、`visitedAt`，软删除。
**地图改造新增（Phase 2）**：`provinceId`、`cityId`（行政区划 adcode，足迹点亮用）、
`coordType`（坐标系标注，默认 `gcj02`）。
> 索引：coupleId、createdById、(coupleId, placeType)、(coupleId, visibility)。

### Memory
回忆故事，关联某个 Place。`title`、`content`(Text)、`mood`、`memoryDate`、
`visibility`，软删除。
**标签新增**：`tags String?`（可空，**逗号拼接**的标签字符串，最多 8 个、每个 1–20 字符；
服务端去空白、去重后写入）。`GET /api/memories?tag=` 对该字段做 `contains` 模糊过滤。
> 索引：coupleId、placeId、createdById、(coupleId, visibility)。

### Media
照片元数据，关联某条 Memory。`fileUrl`、`objectKey`、`mimeType`、`width`、`height`、
`size`、`sortOrder`，软删除。真实上传走服务端签名（Phase 12）。
> 索引：coupleId、memoryId、uploaderId。

### Checkin
位置打卡。`userId`、可选 `placeId`、经纬度、`address`、`accuracy`、`shareScope`
（默认 self）、`expiresAt`（临时共享过期），软删除。**无后台定位**。
**地图改造新增（Phase 2）**：`coordType`（坐标系标注，默认 `gcj02`）。
> 索引：coupleId、userId、placeId、**(coupleId, shareScope, expiresAt)**（查 partner 最近有效位置）。

### Task
任务。`creatorId`、`assigneeId`、`title`、`description`、`points`、`status`
（状态机）、`dueAt`、可选 `relatedPlaceId`，软删除。
> 索引：coupleId、creatorId、assigneeId、(coupleId, status)。

### PointLedger
积分流水（不可变，无软删除）。`userId`、`sourceType`、`sourceId`、`points`
（兑换为负数）、`description`。
> 索引：coupleId、userId、(coupleId, userId)、(sourceType, sourceId)。

### ShopItem
情侣商品。`creatorId`、`title`、`description`、`pricePoints`、`stock`、`status`，软删除。
> 索引：coupleId、creatorId、(coupleId, status)。

### Redemption
兑换记录 / 背包。`itemId`、`buyerId`、`status`（unused/used/cancelled）、`usedAt`。
> 索引：coupleId、itemId、buyerId、(coupleId, status)。

### Event
日程 / 纪念日。`creatorId`、`title`、`eventType`、`eventDate`、`repeatRule`（仅存储，
不解析复杂规则）、可选 `relatedPlaceId`，软删除。
> 索引：coupleId、creatorId、(coupleId, eventType)、(coupleId, eventDate)。

### PrivacyConsent
隐私授权记录。`userId`、`consentType`、`version`、`agreedAt`、`revokedAt`。
> 索引：userId、(userId, consentType)。

### PublicShare
公开地图分享。`shareCode`（唯一）、`title`、`enabled`（默认 true）、`createdById`、
`disabledAt`。公开内容默认仅 `visibility=public`，坐标脱敏（Phase 10）。
> 索引：coupleId、createdById。

### LocationShareSession（地图改造 Phase 2）
临时位置共享会话。`coupleId`、`userId`、`status`（active / stopped / expired）、
`mode`（temporary）、`visibility`（partner）、`startedAt`、`expiresAt`（**必填，强制过期**）、
`stoppedAt`。仅用户主动开启；伴侣只能看到 active 且未过期会话的最新位置；可随时停止。
> 索引：(coupleId, userId, status)、(coupleId, status, expiresAt)。

### LocationPoint（地图改造 Phase 2）
共享会话期间上报的位置点（**节流后样本，非高频全量轨迹**）。`sessionId`（外键→
LocationShareSession）、`coupleId`、`userId`、经纬度、`coordType`（默认 gcj02）、
`accuracy`、`speed`、`heading`、`address`、`clientTime`、`serverTime`，软删除。
最新位置另存 Redis `location:latest:{coupleId}:{userId}`（Phase 6）。
> 索引：(coupleId, userId, createdAt)、(sessionId)。

### Mood（今日心情）
每人每天一条心情。`coupleId`、`userId`、`mood`（字符串，取值
`happy|miss|tired|angry|hug|calm`）、可选 `note`、`day`（`YYYY-MM-DD` 字符串，按本地日期分桶）。
按 `(coupleId, userId, day)` upsert，**无软删除**（当天可覆盖）。
> 唯一：`@@unique([coupleId, userId, day])`。索引：coupleId、userId。

### QaAnswer（情侣问答）
情侣每日问答的单条答案。`coupleId`、`userId`、`questionKey`（标识当日问题，如 `YYYY-MM-DD`）、
`answer`（Text）。**双方都回答后才能互看**（业务层控制，见 docs/API.md「情侣问答」）。
每人每题一条、可覆盖；**无软删除**。
> 唯一：`@@unique([coupleId, userId, questionKey])`。索引：coupleId、userId。

### PlaceVote（地点投票）
情侣双方对共享地点投票。`coupleId`、`placeId`、`userId`、`vote`（字符串，取值
`want|meh|no`）。每人每地点一票、可改票（按 `(placeId, userId)` upsert）；**无软删除**。
> 唯一：`@@unique([placeId, userId])`。索引：`(coupleId, placeId)`。

### ReminderSubscription（订阅消息提醒记录）
订阅消息真实下发的订阅记录。用户经 `wx.requestSubscribeMessage` 授权后落库，到期由
`POST /api/notifications/run-due` 读取并经微信 `subscribeMessage` 下发。
`coupleId`、`userId`、`templateId`、可选 `eventId`、可选 `remindAt`（到期时间）、
可选 `sentAt`（已下发时间，下发成功后回填，保证只发一次）；**无软删除**。
> 索引：`(coupleId, userId)`、`(sentAt, remindAt)`（查到期未发送）。

### ProfileFact（Love Map 档案：关于 TA 的小事实）
情侣双方各自累积的「关于我」小事实（如喜欢的食物、纪念日偏好）。`coupleId`、`userId`、
`key`、`value`。每人每 `key` 一条、可覆盖（按 `(coupleId, userId, key)` upsert）；**无软删除**。
> 唯一：`@@unique([coupleId, userId, key])`。索引：`(coupleId, userId)`。

### Feedback（用户反馈，运营）
用户提交的意见反馈。`userId`、可选 `coupleId`（未绑定情侣时为 `null`）、`content`(Text)、
可选 `contact`、`status`（`open` / `closed`，默认 `open`）；**无软删除**。
> 索引：`(status, createdAt)`。

### ErrorLog（接口错误日志，运营）
服务端级错误（`statusCode >= 500`）由统一错误处理器**即发即忘**地异步落库，用于排查接口异常。
`method`、`url`、`statusCode`、可选 `code`、可选 `message`(Text)、可选 `userId`；**无软删除**。
日志写入失败绝不影响响应。
> 索引：`createdAt`、`statusCode`。

## 迁移与生成命令

```bash
# 配置数据库连接（apps/api/.env）
DATABASE_URL="mysql://user:password@localhost:3306/love_map_mini"

# 生成 Prisma Client（已在 Phase 3 验证通过）
npm run prisma:generate --workspace apps/api

# 本地开发：创建并应用迁移（需要可连接的 MySQL）
npm run prisma:migrate --workspace apps/api     # = prisma migrate dev

# 生产：应用已有迁移
npx prisma migrate deploy        # 在 apps/api 目录

# 可视化查看数据
npm run prisma:studio --workspace apps/api
```

> 迁移历史：`<timestamp>_init`（初始 13 张表）、`<timestamp>_map_module_phase2`
> （地图改造：Place/Checkin 附加字段 + LocationShareSession/LocationPoint 两张新表）、
> `<timestamp>_mood_qa`（情感互动：新增 Mood / QaAnswer 两张表，各带各自的复合唯一约束）、
> `<timestamp>_tags_vote_reminder`（回忆标签 + 地点投票 + 订阅消息：Memory 新增 `tags` 列、
> 新增 PlaceVote / ReminderSubscription 两张表，各带唯一/索引约束）、
> `<timestamp>_profile_feedback_errorlog`（Love Map 档案 + 用户反馈 + 错误日志：新增
> ProfileFact / Feedback / ErrorLog 三张表，各带唯一/索引约束）。
> 本地 MySQL 已服务化运行，各条迁移均已 `prisma migrate deploy` 应用，`prisma migrate status`
> 显示「Database schema is up to date!」。
>
> 注：非交互环境下 `prisma migrate dev` 会拒绝执行；本项目用
> `prisma migrate diff` 生成增量 SQL → 写入迁移目录 → `prisma migrate deploy` 应用。
> 迁移 SQL 文件须为 **UTF-8 无 BOM**（PowerShell `Set-Content -Encoding utf8` 会写入 BOM 导致
> MySQL 1064 语法错误，应改用 `[IO.File]::WriteAllText` + `UTF8Encoding($false)`）。
