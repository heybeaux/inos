-- CreateTable
CREATE TABLE "Canvas" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "authorJson" TEXT NOT NULL,
    "participants" TEXT NOT NULL DEFAULT '[]',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "schemaVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "InosNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "canvasId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contentJson" TEXT NOT NULL,
    "authorJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'fresh',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "dependsOn" TEXT NOT NULL DEFAULT '[]',
    "visits" TEXT NOT NULL DEFAULT '[]',
    "staleness" TEXT NOT NULL,
    "sourceSpan" TEXT,
    "posX" REAL,
    "posY" REAL,
    "engramMemoryId" TEXT,
    "factKey" TEXT,
    "schemaVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InosNode_canvasId_fkey" FOREIGN KEY ("canvasId") REFERENCES "Canvas" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Edge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "canvasId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "label" TEXT,
    "authorJson" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Edge_canvasId_fkey" FOREIGN KEY ("canvasId") REFERENCES "Canvas" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Fact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "canvasId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "valueJson" TEXT NOT NULL,
    "unit" TEXT,
    "staleness" TEXT NOT NULL DEFAULT 'current',
    "sources" TEXT NOT NULL DEFAULT '[]',
    "conflicts" TEXT NOT NULL DEFAULT '[]',
    "dependedOnBy" TEXT NOT NULL DEFAULT '[]',
    "updatedAt" DATETIME NOT NULL,
    "updatedByJson" TEXT NOT NULL,
    CONSTRAINT "Fact_canvasId_fkey" FOREIGN KEY ("canvasId") REFERENCES "Canvas" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "InosNode_canvasId_idx" ON "InosNode"("canvasId");

-- CreateIndex
CREATE INDEX "InosNode_canvasId_type_idx" ON "InosNode"("canvasId", "type");

-- CreateIndex
CREATE INDEX "Edge_canvasId_idx" ON "Edge"("canvasId");

-- CreateIndex
CREATE INDEX "Edge_sourceId_idx" ON "Edge"("sourceId");

-- CreateIndex
CREATE INDEX "Edge_targetId_idx" ON "Edge"("targetId");

-- CreateIndex
CREATE INDEX "Fact_canvasId_idx" ON "Fact"("canvasId");

-- CreateIndex
CREATE UNIQUE INDEX "Fact_canvasId_key_key" ON "Fact"("canvasId", "key");
