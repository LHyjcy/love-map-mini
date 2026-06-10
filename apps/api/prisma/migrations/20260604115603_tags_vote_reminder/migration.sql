-- Memory tags + PlaceVote + ReminderSubscription (additive, non-destructive).
ALTER TABLE `memory` ADD COLUMN `tags` VARCHAR(191) NULL;

CREATE TABLE `PlaceVote` (
    `id` VARCHAR(191) NOT NULL,
    `coupleId` VARCHAR(191) NOT NULL,
    `placeId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `vote` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `PlaceVote_coupleId_placeId_idx`(`coupleId`, `placeId`),
    UNIQUE INDEX `PlaceVote_placeId_userId_key`(`placeId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ReminderSubscription` (
    `id` VARCHAR(191) NOT NULL,
    `coupleId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NULL,
    `remindAt` DATETIME(3) NULL,
    `sentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `ReminderSubscription_coupleId_userId_idx`(`coupleId`, `userId`),
    INDEX `ReminderSubscription_sentAt_remindAt_idx`(`sentAt`, `remindAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;