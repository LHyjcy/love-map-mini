-- ProfileFact + Feedback + ErrorLog (additive, non-destructive).
CREATE TABLE `ProfileFact` (
    `id` VARCHAR(191) NOT NULL,
    `coupleId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `value` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `ProfileFact_coupleId_userId_idx`(`coupleId`, `userId`),
    UNIQUE INDEX `ProfileFact_coupleId_userId_key_key`(`coupleId`, `userId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Feedback` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `coupleId` VARCHAR(191) NULL,
    `content` TEXT NOT NULL,
    `contact` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'open',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `Feedback_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ErrorLog` (
    `id` VARCHAR(191) NOT NULL,
    `method` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `statusCode` INTEGER NOT NULL,
    `code` VARCHAR(191) NULL,
    `message` TEXT NULL,
    `userId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `ErrorLog_createdAt_idx`(`createdAt`),
    INDEX `ErrorLog_statusCode_idx`(`statusCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;