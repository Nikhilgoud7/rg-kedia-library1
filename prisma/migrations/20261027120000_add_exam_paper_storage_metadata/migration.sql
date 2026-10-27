-- AlterTable
ALTER TABLE "ExamPaper" ADD COLUMN "storageProvider" TEXT NOT NULL DEFAULT 'local',
ADD COLUMN "storageKey" TEXT,
ADD COLUMN "originalFileName" TEXT,
ADD COLUMN "mimeType" TEXT,
ADD COLUMN "fileSizeBytes" INTEGER,
ADD COLUMN "checksum" TEXT,
ADD COLUMN "publishedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ExamPaper_publishedAt_idx" ON "ExamPaper"("publishedAt");

-- CreateIndex
CREATE INDEX "ExamPaper_storageProvider_idx" ON "ExamPaper"("storageProvider");
