-- 热路径打卡查询复合索引：GET /api/checkins、partner-latest、map markers、co-checkin
-- 均按 (coupleId, userId) 过滤并按 createdAt 倒序，本索引消除全量读取后的 filesort。
CREATE INDEX `Checkin_coupleId_userId_createdAt_idx` ON `Checkin`(`coupleId`, `userId`, `createdAt`);
