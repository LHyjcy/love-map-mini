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

## 模型（13 张表）

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
> 索引：coupleId、createdById、(coupleId, placeType)、(coupleId, visibility)。

### Memory
回忆故事，关联某个 Place。`title`、`content`(Text)、`mood`、`memoryDate`、
`visibility`，软删除。
> 索引：coupleId、placeId、createdById、(coupleId, visibility)。

### Media
照片元数据，关联某条 Memory。`fileUrl`、`objectKey`、`mimeType`、`width`、`height`、
`size`、`sortOrder`，软删除。真实上传走服务端签名（Phase 12）。
> 索引：coupleId、memoryId、uploaderId。

### Checkin
位置打卡。`userId`、可选 `placeId`、经纬度、`address`、`accuracy`、`shareScope`
（默认 self）、`expiresAt`（临时共享过期），软删除。**无后台定位**。
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

> 初始迁移 SQL 已生成于 `apps/api/prisma/migrations/<timestamp>_init/migration.sql`
> （通过 `prisma migrate diff` 离线生成）。当前开发环境尚无运行中的 MySQL，**迁移尚未实际应用**；
> 接入数据库后执行 `prisma migrate deploy`（或首次 `migrate dev`）即可建表。
