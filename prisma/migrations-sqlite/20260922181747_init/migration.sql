-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ServiceConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "tokenExpiresAt" DATETIME,
    "externalUserId" TEXT,
    "externalUsername" TEXT,
    "scoreFormat" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ServiceConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyncConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sourceService" TEXT,
    "autoSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SyncConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyncDestinationConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "syncConfigId" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "destructive" BOOLEAN NOT NULL DEFAULT false,
    "importAnime" BOOLEAN NOT NULL DEFAULT true,
    "importManga" BOOLEAN NOT NULL DEFAULT true,
    "importStatus" BOOLEAN NOT NULL DEFAULT true,
    "importProgress" BOOLEAN NOT NULL DEFAULT true,
    "importRatings" BOOLEAN NOT NULL DEFAULT true,
    "ratingRoundMode" TEXT NOT NULL DEFAULT 'NEAREST',
    "importComments" BOOLEAN NOT NULL DEFAULT false,
    "importCustomLists" BOOLEAN NOT NULL DEFAULT false,
    "importStartDate" BOOLEAN NOT NULL DEFAULT true,
    "importFinishDate" BOOLEAN NOT NULL DEFAULT true,
    "importRewatches" BOOLEAN NOT NULL DEFAULT true,
    "importPriority" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "SyncDestinationConfig_syncConfigId_fkey" FOREIGN KEY ("syncConfigId") REFERENCES "SyncConfig" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'running',
    "errorMessage" TEXT,
    CONSTRAINT "SyncRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyncRunResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "syncRunId" TEXT NOT NULL,
    "destinationService" TEXT NOT NULL,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "skippedEntries" TEXT,
    CONSTRAINT "SyncRunResult_syncRunId_fkey" FOREIGN KEY ("syncRunId") REFERENCES "SyncRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceConnection_userId_service_key" ON "ServiceConnection"("userId", "service");

-- CreateIndex
CREATE UNIQUE INDEX "SyncConfig_userId_key" ON "SyncConfig"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncDestinationConfig_syncConfigId_service_key" ON "SyncDestinationConfig"("syncConfigId", "service");

-- CreateIndex
CREATE UNIQUE INDEX "SyncRunResult_syncRunId_destinationService_key" ON "SyncRunResult"("syncRunId", "destinationService");
