# DATABASE — love-map-mini

数据库：MySQL，ORM：Prisma。

> Phase 1 仅占位。完整 schema 在 Phase 3 设计并实现，届时本文件将列出所有模型、
> 枚举、关系与索引。

## 计划中的核心模型（Phase 3）

User、Couple、Place、Memory、Media、Checkin、Task、PointLedger、ShopItem、
Redemption、Event、PrivacyConsent、PublicShare。

## 通用约定

- 使用枚举表达状态字段。
- 关键关系（coupleId、userId、placeId 等）建立外键与索引。
- 支持软删除（`deletedAt`），查询需正确过滤。
- 积分与库存变更使用事务。
