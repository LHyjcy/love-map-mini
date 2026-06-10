-- Phase 2: map module - add Place/Checkin columns + LocationShare tables (additive, non-destructive).
ALTER TABLE `checkin` ADD COLUMN `coordType` VARCHAR(191) NULL DEFAULT 'gcj02';

ALTER TABLE `place` ADD COLUMN `cityId` VARCHAR(191) NULL,
    ADD COLUMN `coordType` VARCHAR(191) NULL DEFAULT 'gcj02',
    ADD COLUMN `provinceId` VARCHAR(191) NULL;

CREATE TABLE `LocationShareSession` (
    `id` VARCHAR(191) NOT NULL,
    `coupleId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `mode` VARCHAR(191) NOT NULL DEFAULT 'temporary',
    `visibility` VARCHAR(191) NOT NULL DEFAULT 'partner',
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `stoppedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `LocationShareSession_coupleId_userId_status_idx`(`coupleId`, `userId`, `status`),
    INDEX `LocationShareSession_coupleId_status_expiresAt_idx`(`coupleId`, `status`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `LocationPoint` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `coupleId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `latitude` DECIMAL(10, 7) NOT NULL,
    `longitude` DECIMAL(10, 7) NOT NULL,
    `coordType` VARCHAR(191) NOT NULL DEFAULT 'gcj02',
    `accuracy` DOUBLE NULL,
    `speed` DOUBLE NULL,
    `heading` DOUBLE NULL,
    `address` VARCHAR(191) NULL,
    `clientTime` DATETIME(3) NULL,
    `serverTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deletedAt` DATETIME(3) NULL,
    INDEX `LocationPoint_coupleId_userId_createdAt_idx`(`coupleId`, `userId`, `createdAt`),
    INDEX `LocationPoint_sessionId_idx`(`sessionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `LocationPoint` ADD CONSTRAINT `LocationPoint_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `LocationShareSession`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;