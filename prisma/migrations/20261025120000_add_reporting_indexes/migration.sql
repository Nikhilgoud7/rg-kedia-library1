-- CreateIndex
CREATE INDEX "BookCopy_status_idx" ON "BookCopy"("status");

-- CreateIndex
CREATE INDEX "BookCopy_bookId_status_condition_idx" ON "BookCopy"("bookId", "status", "condition");

-- CreateIndex
CREATE INDEX "Lending_issuedDate_status_idx" ON "Lending"("issuedDate", "status");

-- CreateIndex
CREATE INDEX "Lending_dueDate_status_idx" ON "Lending"("dueDate", "status");
