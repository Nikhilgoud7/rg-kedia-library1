-- AlterTable
ALTER TABLE "User" ADD COLUMN "gender" TEXT,
ADD COLUMN "approvalStatus" TEXT NOT NULL DEFAULT 'APPROVED',
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "approvedById" TEXT,
ADD COLUMN "rejectionReason" TEXT;

-- CreateIndex
CREATE INDEX "User_approvalStatus_idx" ON "User"("approvalStatus");

-- CreateIndex
CREATE INDEX "User_role_approvalStatus_idx" ON "User"("role", "approvalStatus");
