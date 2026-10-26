-- CreateTable
CREATE TABLE "LibraryAudit" (
    "id" TEXT NOT NULL,
    "auditNumber" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "academicYear" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "leadLibrarianId" TEXT NOT NULL,
    "observations" TEXT,
    "recommendations" TEXT,
    "snapshotData" TEXT,
    "completedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryAuditSession" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "totalExpected" INTEGER NOT NULL DEFAULT 0,
    "totalScanned" INTEGER NOT NULL DEFAULT 0,
    "totalMatched" INTEGER NOT NULL DEFAULT 0,
    "totalMissing" INTEGER NOT NULL DEFAULT 0,
    "totalIssued" INTEGER NOT NULL DEFAULT 0,
    "totalSurplus" INTEGER NOT NULL DEFAULT 0,
    "totalDiscrepancy" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryAuditSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryAuditScan" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "bookCopyId" TEXT,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scannedById" TEXT NOT NULL,
    "matchStatus" TEXT NOT NULL,
    "scannedShelf" TEXT,
    "notes" TEXT,

    CONSTRAINT "InventoryAuditScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditDiscrepancy" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "bookId" TEXT,
    "bookCopyId" TEXT,
    "barcode" TEXT,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "description" TEXT NOT NULL,
    "discoveredDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolutionNotes" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditDiscrepancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditCorrectiveAction" (
    "id" TEXT NOT NULL,
    "discrepancyId" TEXT NOT NULL,
    "actionTaken" TEXT NOT NULL,
    "actionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performedById" TEXT NOT NULL,
    "resultingStatus" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditCorrectiveAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LibraryAudit_auditNumber_key" ON "LibraryAudit"("auditNumber");
CREATE INDEX "LibraryAudit_type_status_idx" ON "LibraryAudit"("type", "status");
CREATE INDEX "LibraryAudit_periodStart_periodEnd_idx" ON "LibraryAudit"("periodStart", "periodEnd");
CREATE INDEX "LibraryAudit_academicYear_idx" ON "LibraryAudit"("academicYear");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryAuditSession_auditId_key" ON "InventoryAuditSession"("auditId");
CREATE INDEX "InventoryAuditSession_status_idx" ON "InventoryAuditSession"("status");

-- CreateIndex
CREATE INDEX "InventoryAuditScan_sessionId_matchStatus_idx" ON "InventoryAuditScan"("sessionId", "matchStatus");
CREATE UNIQUE INDEX "InventoryAuditScan_sessionId_barcode_key" ON "InventoryAuditScan"("sessionId", "barcode");

-- CreateIndex
CREATE INDEX "AuditDiscrepancy_auditId_status_idx" ON "AuditDiscrepancy"("auditId", "status");
CREATE INDEX "AuditDiscrepancy_category_idx" ON "AuditDiscrepancy"("category");

-- CreateIndex
CREATE INDEX "AuditCorrectiveAction_discrepancyId_idx" ON "AuditCorrectiveAction"("discrepancyId");

-- AddForeignKey
ALTER TABLE "LibraryAudit" ADD CONSTRAINT "LibraryAudit_leadLibrarianId_fkey" FOREIGN KEY ("leadLibrarianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryAuditSession" ADD CONSTRAINT "InventoryAuditSession_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "LibraryAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryAuditScan" ADD CONSTRAINT "InventoryAuditScan_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InventoryAuditSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryAuditScan" ADD CONSTRAINT "InventoryAuditScan_scannedById_fkey" FOREIGN KEY ("scannedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryAuditScan" ADD CONSTRAINT "InventoryAuditScan_bookCopyId_fkey" FOREIGN KEY ("bookCopyId") REFERENCES "BookCopy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditDiscrepancy" ADD CONSTRAINT "AuditDiscrepancy_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "LibraryAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditDiscrepancy" ADD CONSTRAINT "AuditDiscrepancy_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditDiscrepancy" ADD CONSTRAINT "AuditDiscrepancy_bookCopyId_fkey" FOREIGN KEY ("bookCopyId") REFERENCES "BookCopy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditCorrectiveAction" ADD CONSTRAINT "AuditCorrectiveAction_discrepancyId_fkey" FOREIGN KEY ("discrepancyId") REFERENCES "AuditDiscrepancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditCorrectiveAction" ADD CONSTRAINT "AuditCorrectiveAction_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
