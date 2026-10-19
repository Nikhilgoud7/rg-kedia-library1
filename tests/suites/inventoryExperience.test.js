// tests/suites/inventoryExperience.test.js — Phase 6E Librarian Physical Inventory UI & Copy Management Suite
import { createApiClient, findLeakedSecrets } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';

export async function runInventoryExperienceTests(baseUrl, assert) {
  const dataManager = new TestDataManager();

  try {
    // ---------------------------------------------------------
    // 1. Setup Personas & Clients
    // ---------------------------------------------------------
    const librarian = await dataManager.createLibrarian({ tag: 'p6e_lib' });
    const librarianClient = createApiClient(baseUrl);
    librarianClient.loginAs(librarian);

    const student = await dataManager.createStudent({ tag: 'p6e_stu' });
    const studentClient = createApiClient(baseUrl);
    studentClient.loginAs(student);

    const teacher = await dataManager.createTeacher({ tag: 'p6e_tch' });
    const teacherClient = createApiClient(baseUrl);
    teacherClient.loginAs(teacher);

    const unauthClient = createApiClient(baseUrl);

    // Initial test book with 2 copies
    const book1 = await dataManager.createBook({
      title: 'Physical Inventory Management Test Volume',
      totalCopies: 2,
      tag: 'p6e_book1',
    });

    const initialCopies = await dataManager.prisma.bookCopy.findMany({
      where: { bookId: book1.id },
      orderBy: { copyNumber: 'asc' },
    });
    assert(initialCopies.length === 2, 'Initial book has exactly 2 copies');

    // ---------------------------------------------------------
    // 2. Add Physical Copies (Step 2 Requirements)
    // ---------------------------------------------------------
    // 2.1 Single-copy creation with shelfLocation and barcode
    const singleAddRes = await librarianClient.request('POST', `/api/books/${book1.id}/copies`, {
      body: {
        count: 1,
        condition: 'Good',
        shelfLocation: 'Rack B-101',
        barcode: 'P6E-BC-101',
      },
    });
    assert(singleAddRes.status === 201, 'Single-copy creation succeeds with HTTP 201');
    assert(Array.isArray(singleAddRes.data.copies) && singleAddRes.data.copies.length === 1, 'Single copy returned in response array');
    assert(singleAddRes.data.copies[0].shelfLocation === 'Rack B-101', 'Copy-level shelfLocation persists accurately');
    assert(singleAddRes.data.copies[0].barcode === 'P6E-BC-101', 'Specified barcode persists accurately');

    // 2.2 Batch copy creation (3 copies with default condition and shelf location)
    const batchAddRes = await librarianClient.request('POST', `/api/books/${book1.id}/copies`, {
      body: {
        count: 3,
        condition: 'Good',
        shelfLocation: 'Rack B-102',
      },
    });
    assert(batchAddRes.status === 201, 'Batch copy creation succeeds with HTTP 201');
    assert(batchAddRes.data.copies.length === 3, 'Batch added exactly 3 copies');
    assert(
      batchAddRes.data.copies.every((c) => Boolean(c.barcode)),
      'Auto-generated barcodes sequentially assigned to batch copies'
    );

    // 2.3 Maximum count boundary validation
    const overLimitRes = await librarianClient.request('POST', `/api/books/${book1.id}/copies`, {
      body: { count: 51 },
    });
    assert(overLimitRes.status === 400, 'Count > 50 rejected with HTTP 400');

    const zeroCountRes = await librarianClient.request('POST', `/api/books/${book1.id}/copies`, {
      body: { count: 0 },
    });
    assert(zeroCountRes.status === 400, 'Count < 1 rejected with HTTP 400');

    // 2.4 Duplicate barcode rejection
    const dupBarcodeRes = await librarianClient.request('POST', `/api/books/${book1.id}/copies`, {
      body: { count: 1, barcode: 'P6E-BC-101' },
    });
    assert(dupBarcodeRes.status === 409, 'Duplicate barcode rejected with HTTP 409');

    // 2.5 Authoritative parent book counter update after adding copies
    const bookAfterAddRes = await librarianClient.request('GET', `/api/books/${book1.id}`);
    assert(bookAfterAddRes.status === 200, 'GET /api/books/:id succeeds');
    assert(bookAfterAddRes.data.book.totalCopies === 6, 'Parent book totalCopies updated to 6 (2 initial + 1 + 3)');
    assert(bookAfterAddRes.data.book.availableCopies === 6, 'Parent book availableCopies updated to 6');

    // ---------------------------------------------------------
    // 3. Copy Management & Editing (Step 3 Requirements)
    // ---------------------------------------------------------
    const targetCopy = singleAddRes.data.copies[0];

    // 3.1 Edit copy condition and shelf location
    const updateRes = await librarianClient.request('PUT', `/api/books/copies/${targetCopy.id}`, {
      body: {
        condition: 'Fair',
        shelfLocation: 'Rack B-999',
      },
    });
    assert(updateRes.status === 200, 'Editing copy condition & shelf location succeeds with HTTP 200');
    assert(updateRes.data.copy.condition === 'Fair', 'Updated condition is persisted as Fair');
    assert(updateRes.data.copy.shelfLocation === 'Rack B-999', 'Updated shelfLocation is persisted as Rack B-999');

    // 3.2 Forbid manual transition to ISSUED
    const manualIssuedRes = await librarianClient.request('PUT', `/api/books/copies/${targetCopy.id}`, {
      body: { status: 'ISSUED' },
    });
    assert(manualIssuedRes.status === 400, 'Manual transition to ISSUED rejected with HTTP 400');
    assert(
      manualIssuedRes.data.error.includes('lending approval/issue workflow'),
      'Informative error instructs to use lending approval workflow'
    );

    // 3.3 Active loan protection: issued copy cannot be manually altered or bypassed
    const activeLoanCopy = initialCopies[0];
    await dataManager.createLending({
      userId: student.id,
      bookCopyId: activeLoanCopy.id,
      status: 'ISSUED',
    });

    const bypassReturnRes = await librarianClient.request('PUT', `/api/books/copies/${activeLoanCopy.id}`, {
      body: { status: 'AVAILABLE' },
    });
    assert(bypassReturnRes.status === 400, 'Direct status update on actively issued copy rejected with HTTP 400');
    assert(
      bypassReturnRes.data.error.includes('actively issued copy'),
      'Issued-copy protection guard explicitly triggered'
    );

    // ---------------------------------------------------------
    // 4. Copy Removal and Withdrawal (Step 4 Requirements)
    // ---------------------------------------------------------
    // 4.1 Copy without lending history: hard deleted
    const hardDeleteCandidate = batchAddRes.data.copies[0];
    const hardDeleteRes = await librarianClient.request('DELETE', `/api/books/copies/${hardDeleteCandidate.id}`);
    assert(hardDeleteRes.status === 200, 'DELETE /api/books/copies/:id succeeds with HTTP 200');
    assert(hardDeleteRes.data.action === 'DELETED', 'Unborrowed copy is permanently DELETED');

    const checkHardDeleted = await dataManager.prisma.bookCopy.findUnique({
      where: { id: hardDeleteCandidate.id },
    });
    assert(checkHardDeleted === null, 'Hard-deleted copy is completely removed from database');

    // 4.2 Actively issued copy cannot be deleted
    const deleteIssuedRes = await librarianClient.request('DELETE', `/api/books/copies/${activeLoanCopy.id}`);
    assert(deleteIssuedRes.status === 400, 'Attempting to delete actively issued copy rejected with HTTP 400');

    // 4.3 Copy with lending history: marked WITHDRAWN
    const historicalCopy = initialCopies[1];
    // Create and return historical loan
    const pastLending = await dataManager.createLending({
      userId: teacher.id,
      bookCopyId: historicalCopy.id,
      status: 'RETURNED',
      returnedDate: new Date(),
    });

    const softDeleteRes = await librarianClient.request('DELETE', `/api/books/copies/${historicalCopy.id}`);
    assert(softDeleteRes.status === 200, 'Deleting historical copy succeeds with HTTP 200');
    assert(softDeleteRes.data.action === 'WITHDRAWN', 'Historical copy is retained and marked WITHDRAWN');

    const checkWithdrawn = await dataManager.prisma.bookCopy.findUnique({
      where: { id: historicalCopy.id },
    });
    assert(checkWithdrawn?.status === 'WITHDRAWN', 'Withdrawn copy persists in database with status WITHDRAWN');

    // Attempting to delete an already withdrawn copy returns 400
    const deleteWithdrawnRes = await librarianClient.request('DELETE', `/api/books/copies/${historicalCopy.id}`);
    assert(deleteWithdrawnRes.status === 400, 'Deleting already withdrawn copy returns HTTP 400');

    // ---------------------------------------------------------
    // 5. Lost & Damaged Reactivation Confirmation (Step 5 Requirements)
    // ---------------------------------------------------------
    // Transition targetCopy to LOST
    await librarianClient.request('PUT', `/api/books/copies/${targetCopy.id}`, {
      body: { status: 'LOST' },
    });

    // 5.1 Reactivation without reactivate: true is rejected
    const unconfirmedReactivateRes = await librarianClient.request('PUT', `/api/books/copies/${targetCopy.id}`, {
      body: { status: 'AVAILABLE' },
    });
    assert(unconfirmedReactivateRes.status === 400, 'Reactivating LOST copy without reactivate: true rejected with HTTP 400');
    assert(
      unconfirmedReactivateRes.data.error.includes('explicit reactivation confirmation'),
      'Reactivation error requires explicit confirmation flag'
    );

    // 5.2 Reactivation with condition 'Damaged' is rejected
    const damagedReactivateRes = await librarianClient.request('PUT', `/api/books/copies/${targetCopy.id}`, {
      body: { status: 'AVAILABLE', condition: 'Damaged', reactivate: true },
    });
    assert(damagedReactivateRes.status === 400, 'Reactivating copy with Damaged condition rejected with HTTP 400');

    // 5.3 Valid reactivation with reactivate: true succeeds
    const validReactivateRes = await librarianClient.request('PUT', `/api/books/copies/${targetCopy.id}`, {
      body: { status: 'AVAILABLE', condition: 'Good', reactivate: true },
    });
    assert(validReactivateRes.status === 200, 'Valid reactivation with reactivate: true succeeds with HTTP 200');
    assert(validReactivateRes.data.copy.status === 'AVAILABLE', 'Reactivated copy restored to AVAILABLE');

    // ---------------------------------------------------------
    // 6. Inventory Stock Reconciliation (Step 6 Requirements)
    // ---------------------------------------------------------
    // 6.1 Consistent book returns in-sync status
    const inSyncReconcileRes = await librarianClient.request('POST', `/api/books/${book1.id}/reconcile`);
    assert(inSyncReconcileRes.status === 200, 'Reconciliation endpoint succeeds with HTTP 200');
    assert(inSyncReconcileRes.data.result.reconciled === false, 'Consistent inventory correctly reports reconciled: false (in-sync)');
    assert(inSyncReconcileRes.data.result.totalDrift === 0, 'Total drift is exactly 0 for in-sync book');
    assert(inSyncReconcileRes.data.result.availableDrift === 0, 'Available drift is exactly 0 for in-sync book');

    // 6.2 Simulate counter drift and verify detection and repair
    await dataManager.prisma.book.update({
      where: { id: book1.id },
      data: { totalCopies: 99, availableCopies: 0 },
    });

    const repairedReconcileRes = await librarianClient.request('POST', `/api/books/${book1.id}/reconcile`);
    assert(repairedReconcileRes.status === 200, 'Drifted book reconcile returns HTTP 200');
    assert(repairedReconcileRes.data.result.reconciled === true, 'Drifted book successfully detected and reconciled: true');
    assert(repairedReconcileRes.data.result.previousTotalCopies === 99, 'Previous totalCopies accurately recorded');
    assert(repairedReconcileRes.data.result.correctedTotalCopies < 99, 'Corrected totalCopies reflects actual non-withdrawn copies');

    const databaseRepairedBook = await dataManager.prisma.book.findUnique({
      where: { id: book1.id },
    });
    assert(databaseRepairedBook?.totalCopies === repairedReconcileRes.data.result.correctedTotalCopies, 'Database book reflects corrected totalCopies');
    assert(databaseRepairedBook?.availableCopies === repairedReconcileRes.data.result.correctedAvailableCopies, 'Database book reflects corrected availableCopies');

    // ---------------------------------------------------------
    // 7. Role Security & Secret Leak Audits (Step 8 Requirements)
    // ---------------------------------------------------------
    const studentAddCopiesRes = await studentClient.request('POST', `/api/books/${book1.id}/copies`, {
      body: { count: 1 },
    });
    assert(studentAddCopiesRes.status === 403, 'Student is forbidden from adding copies (HTTP 403)');

    const teacherDeleteCopyRes = await teacherClient.request('DELETE', `/api/books/copies/${targetCopy.id}`);
    assert(teacherDeleteCopyRes.status === 403, 'Teacher is forbidden from removing copies (HTTP 403)');

    const unauthReconcileRes = await unauthClient.request('POST', `/api/books/${book1.id}/reconcile`);
    assert(unauthReconcileRes.status === 401, 'Unauthenticated user cannot reconcile inventory (HTTP 401)');

    const leakedSecrets = findLeakedSecrets(singleAddRes.data);
    assert(leakedSecrets.length === 0, 'Zero sensitive security keys leaked in copy response payload');
  } finally {
    await dataManager.cleanup();
  }
}
