-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `isAdmin` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ServiceConnection` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `service` VARCHAR(191) NOT NULL,
    `accessToken` TEXT NOT NULL,
    `refreshToken` TEXT NULL,
    `tokenExpiresAt` DATETIME(3) NULL,
    `externalUserId` VARCHAR(191) NULL,
    `externalUsername` VARCHAR(191) NULL,
    `scoreFormat` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ServiceConnection_userId_service_key`(`userId`, `service`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SyncConfig` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `sourceService` VARCHAR(191) NULL,
    `autoSyncEnabled` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SyncConfig_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SyncDestinationConfig` (
    `id` VARCHAR(191) NOT NULL,
    `syncConfigId` VARCHAR(191) NOT NULL,
    `service` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `destructive` BOOLEAN NOT NULL DEFAULT false,
    `importAnime` BOOLEAN NOT NULL DEFAULT true,
    `importManga` BOOLEAN NOT NULL DEFAULT true,
    `importStatus` BOOLEAN NOT NULL DEFAULT true,
    `importProgress` BOOLEAN NOT NULL DEFAULT true,
    `importRatings` BOOLEAN NOT NULL DEFAULT true,
    `ratingRoundMode` VARCHAR(191) NOT NULL DEFAULT 'NEAREST',
    `importComments` BOOLEAN NOT NULL DEFAULT false,
    `importCustomLists` BOOLEAN NOT NULL DEFAULT false,
    `importStartDate` BOOLEAN NOT NULL DEFAULT true,
    `importFinishDate` BOOLEAN NOT NULL DEFAULT true,
    `importRewatches` BOOLEAN NOT NULL DEFAULT true,
    `importPriority` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `SyncDestinationConfig_syncConfigId_service_key`(`syncConfigId`, `service`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SyncRun` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `trigger` VARCHAR(191) NOT NULL DEFAULT 'manual',
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'running',
    `errorMessage` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SyncRunResult` (
    `id` VARCHAR(191) NOT NULL,
    `syncRunId` VARCHAR(191) NOT NULL,
    `destinationService` VARCHAR(191) NOT NULL,
    `created` INTEGER NOT NULL DEFAULT 0,
    `updated` INTEGER NOT NULL DEFAULT 0,
    `skipped` INTEGER NOT NULL DEFAULT 0,
    `skippedEntries` TEXT NULL,

    UNIQUE INDEX `SyncRunResult_syncRunId_destinationService_key`(`syncRunId`, `destinationService`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AppSetting` (
    `key` VARCHAR(191) NOT NULL,
    `value` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ServiceConnection` ADD CONSTRAINT `ServiceConnection_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SyncConfig` ADD CONSTRAINT `SyncConfig_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SyncDestinationConfig` ADD CONSTRAINT `SyncDestinationConfig_syncConfigId_fkey` FOREIGN KEY (`syncConfigId`) REFERENCES `SyncConfig`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SyncRun` ADD CONSTRAINT `SyncRun_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SyncRunResult` ADD CONSTRAINT `SyncRunResult_syncRunId_fkey` FOREIGN KEY (`syncRunId`) REFERENCES `SyncRun`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

