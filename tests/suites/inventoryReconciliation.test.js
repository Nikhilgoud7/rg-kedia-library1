// tests/suites/inventoryReconciliation.test.js — Phase 6C Inventory Reconciliation & Consistency Suite
import { createApiClient, findLeakedSecrets } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';

export async function runInventoryReconciliationTests(baseUrl, assert) {
  const dataManager = new TestDataManager();

  try {
    // ---------------------------------------------------------
    // 1. Setup Personas & Clients
    // ---------------------------------------------------------
    const librarian = await dataManager.createLibrarian({ tag: 'rec_lib' });
    const librarianClient = createApiClient(baseUrl);
    librarianClient.loginAs(librarian);

    const teacher = await dataManager.createTeacher({ tag: 'rec_tch' });
    const teacherClient = createApiClient(baseUrl);
    teacherClient.loginAs(teacher);

    const student = await dataManager.createStudent({ tag: 'rec_stu' });
    const studentClient = createApiClient(baseUrl);
    studentClient.loginAs(student);

    const unauthClient = createApiClient(baseUrl);

    // ---------------------------------------------------------
    // 2. Unit & Logic: Status Exclusions in Authoritative Counter Engine
    // ---------------------------------------------------------
    // Create a book with 5 physical copies
    const bookStatusTest = await dataManager.createBook({
      title: 'Status Filtering Test Book',
      totalCopies: 5,
      tag: 'stat_filter',
    });

    const copies = await dataManager.prisma.bookCopy.findMany({
      where: { bookId: bookStatusTest.id },
      orderBy: { copyNumber: 'asc' },
    });
    assert(copies.length === 5, 'Initial 5 copies created successfully', `Expected 5, got ${copies.length}`);

    // Set statuses:
    // Copy 0: AVAILABLE
    // Copy 1: ISSUED
    // Copy 2: RESERVED
    // Copy 3: DAMAGED
    // Copy 4: WITHDRAWN
    await dataManager.prisma.bookCopy.update({ where: { id: copies[1].id }, data: { status: 'ISSUED' } });
    await dataManager.prisma.bookCopy.update({ where: { id: copies[2].id }, data: { status: 'RESERVED' } });
    await dataManager.prisma.bookCopy.update({ where: { id: copies[3].id }, data: { status: 'DAMAGED' } });
    await dataManager.prisma.bookCopy.update({ where: { id: copies[4].id }, data: { status: 'WITHDRAWN' } });

    // Induce drift so reconciliation runs and calculates actual authoritative counts
    await dataManager.prisma.book.update({
      where: { id: bookStatusTest.id },
      data: { totalCopies: 99, availableCopies: 99 },
    });

    const reconcileStatusRes = await librarianClient.request('POST', '/api/books/inventory/reconcile', {
      body: { bookId: bookStatusTest.id },
    });
    assert(reconcileStatusRes.status === 200, 'Reconcile status test book succeeds with HTTP 200');

    assert(
      reconcileStatusRes.data.result.correctedTotalCopies === 4,
      'totalCopies excludes WITHDRAWN copies (4 non-withdrawn copies: Available, Issued, Reserved, Damaged)',
      `Expected 4, got ${reconcileStatusRes.data.result.correctedTotalCopies}`
    );
    assert(
      reconcileStatusRes.data.result.correctedAvailableCopies === 1,
      'availableCopies strictly counts AVAILABLE status only (1 available copy)',
      `Expected 1, got ${reconcileStatusRes.data.result.correctedAvailableCopies}`
    );

    // ---------------------------------------------------------
    // 3. Engine: reconcileBookCounters on Consistent Book
    // ---------------------------------------------------------
    const consistentBook = await dataManager.createBook({
      title: 'Consistent Inventory Book',
      totalCopies: 2,
      tag: 'consist',
    });

    const consistentRes = await librarianClient.request('POST', '/api/books/inventory/reconcile', {
      body: { bookId: consistentBook.id },
    });
    assert(consistentRes.status === 200, 'Consistent book reconcile returns HTTP 200');
    const consistentResult = consistentRes.data.result;

    assert(
      consistentResult.reconciled === false,
      'Consistent book reports reconciled: false',
      `Got reconciled: ${consistentResult.reconciled}`
    );
    assert(
      consistentResult.previousTotalCopies === 2 && consistentResult.correctedTotalCopies === 2,
      'Total copies unchanged for consistent book (2 -> 2)',
      `Got prev=${consistentResult.previousTotalCopies}, corr=${consistentResult.correctedTotalCopies}`
    );
    assert(
      consistentResult.previousAvailableCopies === 2 && consistentResult.correctedAvailableCopies === 2,
      'Available copies unchanged for consistent book (2 -> 2)',
      `Got prev=${consistentResult.previousAvailableCopies}, corr=${consistentResult.correctedAvailableCopies}`
    );
    assert(
      consistentResult.totalDrift === 0 && consistentResult.availableDrift === 0,
      'Drift is zero for consistent book',
      `Got totalDrift=${consistentResult.totalDrift}, availDrift=${consistentResult.availableDrift}`
    );

    // Verify no redundant audit log created for consistent book
    const consistentAudit = await dataManager.prisma.auditLog.findFirst({
      where: {
        action: 'INVENTORY_RECONCILED',
        targetId: consistentBook.id,
      },
    });
    assert(
      consistentAudit === null,
      'No INVENTORY_RECONCILED audit log created when no drift exists',
      'Audit log was unexpectedly created'
    );

    // ---------------------------------------------------------
    // 4. Engine: reconcileBookCounters with Artificially Induced Drift
    // ---------------------------------------------------------
    // Corrupt the stored counters in Book table
    await dataManager.prisma.book.update({
      where: { id: consistentBook.id },
      data: {
        totalCopies: 15,
        availableCopies: 0,
      },
    });

    const repairRes = await librarianClient.request('POST', '/api/books/inventory/reconcile', {
      body: { bookId: consistentBook.id },
    });
    assert(repairRes.status === 200, 'Drifted book reconcile returns HTTP 200');
    const repairResult = repairRes.data.result;

    assert(
      repairResult.reconciled === true,
      'Drifted book successfully detected and reconciled: true',
      `Got reconciled: ${repairResult.reconciled}`
    );
    assert(
      repairResult.previousTotalCopies === 15 && repairResult.correctedTotalCopies === 2,
      'Total copies corrected from drifted value (15 -> 2)',
      `Got prev=${repairResult.previousTotalCopies}, corr=${repairResult.correctedTotalCopies}`
    );
    assert(
      repairResult.previousAvailableCopies === 0 && repairResult.correctedAvailableCopies === 2,
      'Available copies corrected from drifted value (0 -> 2)',
      `Got prev=${repairResult.previousAvailableCopies}, corr=${repairResult.correctedAvailableCopies}`
    );
    assert(
      repairResult.totalDrift === -13 && repairResult.availableDrift === 2,
      'Calculated drift matches discrepancy (-13 total, +2 available)',
      `Got totalDrift=${repairResult.totalDrift}, availDrift=${repairResult.availableDrift}`
    );

    // Verify stored book in database is corrected
    const reloadedBook = await dataManager.prisma.book.findUnique({
      where: { id: consistentBook.id },
    });
    assert(
      reloadedBook?.totalCopies === 2 && reloadedBook?.availableCopies === 2,
      'Database Book record reflects corrected counters (2, 2)',
      `Got total=${reloadedBook?.totalCopies}, avail=${reloadedBook?.availableCopies}`
    );

    // Verify INVENTORY_RECONCILED audit log created with rich metadata
    const repairAudit = await dataManager.prisma.auditLog.findFirst({
      where: {
        action: 'INVENTORY_RECONCILED',
        targetId: consistentBook.id,
      },
    });
    assert(
      repairAudit !== null,
      'INVENTORY_RECONCILED audit log entry created in transaction',
      'Audit log entry not found'
    );
    assert(
      repairAudit?.actorId === librarian.id,
      'Audit log captures librarian actorId',
      `Expected ${librarian.id}, got ${repairAudit?.actorId}`
    );
    const auditDetails = typeof repairAudit?.details === 'string'
      ? JSON.parse(repairAudit.details)
      : repairAudit?.details;
    assert(
      auditDetails?.previousTotalCopies === 15 && auditDetails?.correctedTotalCopies === 2,
      'Audit log details record previousTotalCopies and correctedTotalCopies',
      `Details: ${JSON.stringify(auditDetails)}`
    );

    // ---------------------------------------------------------
    // 5. Engine: reconcileBookCounters on Zero-Copy Book
    // ---------------------------------------------------------
    const zeroBook = await dataManager.createBook({
      title: 'Zero Copy Inventory Book',
      totalCopies: 0,
      tag: 'zero_copy',
    });
    // Induce drift on zero book
    await dataManager.prisma.book.update({
      where: { id: zeroBook.id },
      data: { totalCopies: 4, availableCopies: 4 },
    });

    const zeroRes = await librarianClient.request('POST', '/api/books/inventory/reconcile', {
      body: { bookId: zeroBook.id },
    });
    assert(zeroRes.status === 200, 'Zero-copy book reconcile returns HTTP 200');
    const zeroResult = zeroRes.data.result;

    assert(
      zeroResult.reconciled === true,
      'Zero-copy drifted book repaired successfully',
      `Got reconciled: ${zeroResult.reconciled}`
    );
    assert(
      zeroResult.correctedTotalCopies === 0 && zeroResult.correctedAvailableCopies === 0,
      'Zero-copy book reconciled to exactly 0 total and 0 available copies',
      `Got total=${zeroResult.correctedTotalCopies}, avail=${zeroResult.correctedAvailableCopies}`
    );

    // ---------------------------------------------------------
    // 6. POST /api/books/inventory/reconcile — Authorization Gates
    // ---------------------------------------------------------
    const unauthReconcile = await unauthClient.request('POST', '/api/books/inventory/reconcile', {
      body: {},
    });
    assert(
      unauthReconcile.status === 401,
      'Unauthenticated request rejected with HTTP 401',
      `Got status ${unauthReconcile.status}`
    );

    const studentReconcile = await studentClient.request('POST', '/api/books/inventory/reconcile', {
      body: {},
    });
    assert(
      studentReconcile.status === 403,
      'Student request forbidden with HTTP 403',
      `Got status ${studentReconcile.status}`
    );

    const teacherReconcile = await teacherClient.request('POST', '/api/books/inventory/reconcile', {
      body: {},
    });
    assert(
      teacherReconcile.status === 403,
      'Teacher request forbidden with HTTP 403',
      `Got status ${teacherReconcile.status}`
    );

    // ---------------------------------------------------------
    // 7. POST /api/books/inventory/reconcile — Single Book Validation
    // ---------------------------------------------------------
    const invalidBookIdRes = await librarianClient.request('POST', '/api/books/inventory/reconcile', {
      body: { bookId: 12345 },
    });
    assert(
      invalidBookIdRes.status === 400,
      'Non-string bookId rejected with HTTP 400',
      `Got status ${invalidBookIdRes.status}`
    );

    const nonExistentBookRes = await librarianClient.request('POST', '/api/books/inventory/reconcile', {
      body: { bookId: '00000000-0000-0000-0000-000000000000' },
    });
    assert(
      nonExistentBookRes.status === 404,
      'Non-existent bookId returns HTTP 404',
      `Got status ${nonExistentBookRes.status}`
    );

    // ---------------------------------------------------------
    // 8. POST /api/books/inventory/reconcile — Bulk Reconcile API
    // ---------------------------------------------------------
    const bulkReconcileRes = await librarianClient.request('POST', '/api/books/inventory/reconcile', {
      body: {},
    });
    assert(
      bulkReconcileRes.status === 200,
      'Bulk inventory reconciliation succeeds with HTTP 200',
      `Got status ${bulkReconcileRes.status}`
    );
    assert(
      bulkReconcileRes.data.summary.booksScanned >= 3,
      'Bulk summary reports booksScanned >= 3',
      `Got booksScanned: ${bulkReconcileRes.data.summary?.booksScanned}`
    );
    assert(
      bulkReconcileRes.data.summary.booksFailed === 0,
      'Bulk summary reports 0 failed books',
      `Got booksFailed: ${bulkReconcileRes.data.summary?.booksFailed}`
    );

    // ---------------------------------------------------------
    // 9. Finding 1 Fix: Manual transition to ISSUED rejected
    // ---------------------------------------------------------
    const finding1Book = await dataManager.createBook({
      title: 'Finding 1 ISSUED Transition Book',
      totalCopies: 1,
      tag: 'find1',
    });
    const copyToIssue = finding1Book.copies[0];

    const manualIssueRes = await librarianClient.request('PUT', `/api/books/copies/${copyToIssue.id}`, {
      body: { status: 'ISSUED' },
    });
    assert(
      manualIssueRes.status === 400,
      'Manual transition to ISSUED rejected with HTTP 400',
      `Got status ${manualIssueRes.status}`
    );
    assert(
      manualIssueRes.data.error?.includes('Physical copies cannot be manually transitioned to ISSUED'),
      'Informative error message on manual ISSUED transition attempt',
      `Got error: ${manualIssueRes.data.error}`
    );

    // ---------------------------------------------------------
    // 10. Finding 2 Fix: Reactivation of LOST and DAMAGED copies
    // ---------------------------------------------------------
    // A. Mark copy as LOST
    await librarianClient.request('PUT', `/api/books/copies/${copyToIssue.id}`, {
      body: { status: 'LOST' },
    });

    // Attempt restoring LOST to AVAILABLE without reactivate: true
    const unconfirmedLostRes = await librarianClient.request('PUT', `/api/books/copies/${copyToIssue.id}`, {
      body: { status: 'AVAILABLE' },
    });
    assert(
      unconfirmedLostRes.status === 400,
      'Reactivating LOST copy without reactivate: true is rejected with HTTP 400',
      `Got status ${unconfirmedLostRes.status}`
    );
    assert(
      unconfirmedLostRes.data.error?.includes('explicit reactivation confirmation'),
      'Reactivation error requires reactivate: true',
      `Got error: ${unconfirmedLostRes.data.error}`
    );

    // Attempt restoring LOST to AVAILABLE with reactivate: true but condition Damaged
    const damagedLostRes = await librarianClient.request('PUT', `/api/books/copies/${copyToIssue.id}`, {
      body: { status: 'AVAILABLE', reactivate: true, condition: 'Damaged' },
    });
    assert(
      damagedLostRes.status === 400,
      'Reactivating LOST copy with condition "Damaged" is rejected with HTTP 400',
      `Got status ${damagedLostRes.status}`
    );
    assert(
      damagedLostRes.data.error?.includes('Cannot mark a damaged copy as AVAILABLE'),
      'Damaged condition rejected on reactivation',
      `Got error: ${damagedLostRes.data.error}`
    );

    // Successful reactivation from LOST with reactivate: true and Fair condition
    const validLostReactivate = await librarianClient.request('PUT', `/api/books/copies/${copyToIssue.id}`, {
      body: { status: 'AVAILABLE', reactivate: true, condition: 'Fair' },
    });
    assert(
      validLostReactivate.status === 200,
      'Reactivating LOST copy with valid condition and reactivate: true succeeds with HTTP 200',
      `Got status ${validLostReactivate.status}`
    );
    assert(
      validLostReactivate.data.copy.status === 'AVAILABLE',
      'Copy status is restored to AVAILABLE',
      `Got status: ${validLostReactivate.data.copy?.status}`
    );

    // B. Mark copy as DAMAGED
    await librarianClient.request('PUT', `/api/books/copies/${copyToIssue.id}`, {
      body: { status: 'DAMAGED', condition: 'Damaged' },
    });

    // Attempt restoring DAMAGED to AVAILABLE without reactivate: true
    const unconfirmedDamagedRes = await librarianClient.request('PUT', `/api/books/copies/${copyToIssue.id}`, {
      body: { status: 'AVAILABLE' },
    });
    assert(
      unconfirmedDamagedRes.status === 400,
      'Reactivating DAMAGED copy without reactivate: true is rejected with HTTP 400',
      `Got status ${unconfirmedDamagedRes.status}`
    );

    // Attempt restoring DAMAGED to AVAILABLE with reactivate: true but keeping Damaged condition
    const stillDamagedRes = await librarianClient.request('PUT', `/api/books/copies/${copyToIssue.id}`, {
      body: { status: 'AVAILABLE', reactivate: true },
    });
    assert(
      stillDamagedRes.status === 400,
      'Reactivating DAMAGED copy without repairing condition is rejected with HTTP 400',
      `Got status ${stillDamagedRes.status}`
    );

    // Successful reactivation after repair
    const repairedRes = await librarianClient.request('PUT', `/api/books/copies/${copyToIssue.id}`, {
      body: { status: 'AVAILABLE', reactivate: true, condition: 'Good' },
    });
    assert(
      repairedRes.status === 200,
      'Reactivating repaired copy with Good condition succeeds with HTTP 200',
      `Got status ${repairedRes.status}`
    );

    // ---------------------------------------------------------
    // 11. Finding 3 Fix: Reservation Protection on Copy Deletion
    // ---------------------------------------------------------
    const reservedCopyTest = await dataManager.createBook({
      title: 'Finding 3 Reserved Copy Book',
      totalCopies: 1,
      tag: 'find3',
    });
    const copyToReserve = reservedCopyTest.copies[0];

    // Put copy in RESERVED status
    await dataManager.prisma.bookCopy.update({
      where: { id: copyToReserve.id },
      data: { status: 'RESERVED' },
    });

    const deleteReservedRes = await librarianClient.request('DELETE', `/api/books/copies/${copyToReserve.id}`);
    assert(
      deleteReservedRes.status === 400,
      'Deleting RESERVED copy is rejected with HTTP 400',
      `Got status ${deleteReservedRes.status}`
    );
    assert(
      deleteReservedRes.data.error?.includes('Cannot remove a reserved copy'),
      'Error message forbids removing reserved copy',
      `Got error: ${deleteReservedRes.data.error}`
    );

    // ---------------------------------------------------------
    // 12. Finding 4 Fix: Authoritative Counter Clamping & Drift Prevention
    // ---------------------------------------------------------
    // Add copy and verify counters derive directly from actual physical copies
    const addCopyRes = await librarianClient.request('POST', `/api/books/${finding1Book.id}/copies`, {
      body: { count: 1, condition: 'Good' },
    });
    assert(addCopyRes.status === 201, 'Copy created successfully', `Got status ${addCopyRes.status}`);

    const bookAfterAdd = await librarianClient.request('GET', `/api/books/${finding1Book.id}`);
    assert(
      bookAfterAdd.data.book.totalCopies === 2 && bookAfterAdd.data.book.availableCopies === 2,
      'Authoritative counters synchronize to exact physical copy counts after copy creation',
      `Got total=${bookAfterAdd.data.book.totalCopies}, avail=${bookAfterAdd.data.book.availableCopies}`
    );

    // ---------------------------------------------------------
    // 13. Security & Zero Secret Leakage Check
    // ---------------------------------------------------------
    const leakedInReconcile = findLeakedSecrets(reconcileStatusRes.data);
    assert(
      leakedInReconcile.length === 0,
      'Zero sensitive security keys leaked in single reconcile response',
      `Leaked keys: ${leakedInReconcile.join(', ')}`
    );

    const leakedInBulk = findLeakedSecrets(bulkReconcileRes.data);
    assert(
      leakedInBulk.length === 0,
      'Zero sensitive security keys leaked in bulk reconcile response',
      `Leaked keys: ${leakedInBulk.join(', ')}`
    );
  } finally {
    await dataManager.cleanup();
  }
}
