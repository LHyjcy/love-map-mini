-- Emotional interaction: Mood + QaAnswer tables (additive, non-destructive).
CREATE TABLE `Mood` (
    `id` VARCHAR(191) NOT NULL,
    `coupleId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `mood` VARCHAR(191) NOT NULL,
    `note` VARCHAR(191) NULL,
    `day` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `Mood_coupleId_day_idx`(`coupleId`, `day`),
    UNIQUE INDEX `Mood_coupleId_userId_day_key`(`coupleId`, `userId`, `day`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `QaAnswer` (
    `id` VARCHAR(191) NOT NULL,
    `coupleId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `questionKey` VARCHAR(191) NOT NULL,
    `answer` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `QaAnswer_coupleId_questionKey_idx`(`coupleId`, `questionKey`),
    UNIQUE INDEX `QaAnswer_coupleId_userId_questionKey_key`(`coupleId`, `userId`, `questionKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;