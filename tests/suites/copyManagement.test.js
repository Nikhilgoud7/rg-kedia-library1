// tests/suites/copyManagement.test.js — Phase 6B Physical Copy Management APIs Suite
import { createApiClient, findLeakedSecrets } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';

export async function runCopyManagementTests(baseUrl, assert) {
  const dataManager = new TestDataManager();

  try {
    // ---------------------------------------------------------
    // 1. Setup Personas & Initial Book
    // ---------------------------------------------------------
    const librarian = await dataManager.createLibrarian({ tag: 'cpy_lib' });
    const librarianClient = createApiClient(baseUrl);
    librarianClient.loginAs(librarian);

    const teacher = await dataManager.createTeacher({ tag: 'cpy_tch' });
    const teacherClient = createApiClient(baseUrl);
    teacherClient.loginAs(teacher);

    const student = await dataManager.createStudent({ tag: 'cpy_stu' });
    const studentClient = createApiClient(baseUrl);
    studentClient.loginAs(student);

    const unauthClient = createApiClient(baseUrl);

    // Initial book with 2 copies
    const book1 = await dataManager.createBook({
      title: 'Physical Copy Inventory Book',
      totalCopies: 2,
      tag: 'inv1',
    });

    // ---------------------------------------------------------
    // 2. POST /api/books/:id/copies — Authorization Gates
    // ---------------------------------------------------------
    const unauthAddRes = await unauthClient.request('POST', `/api/books/${book1.id}/copies`, {
      body: { count: 1 },
    });
    assert(
      unauthAddRes.status === 401,
      'Unauthenticated user cannot add book copies (HTTP 401)',
      `Got status ${unauthAddRes.status}`
    );

    const studentAddRes = await studentClient.request('POST', `/api/books/${book1.id}/copies`, {
      body: { count: 1 },
    });
    assert(
      studentAddRes.status === 403,
      'Student is forbidden from adding book copies (HTTP 403)',
      `Got status ${studentAddRes.status}`
    );

    const teacherAddRes = await teacherClient.request('POST', `/api/books/${book1.id}/copies`, {
      body: { count: 1 },
    });
    assert(
      teacherAddRes.status === 403,
      'Teacher is forbidden from adding book copies (HTTP 403)',
      `Got status ${teacherAddRes.status}`
    );

    // ---------------------------------------------------------
    // 3. POST /api/books/:id/copies — Input Validation & Error Handling
    // ---------------------------------------------------------
    const nonExistentBookRes = await librarianClient.request('POST', '/api/books/00000000-0000-0000-0000-000000000000/copies', {
      body: { count: 1 },
    });
    assert(
      nonExistentBookRes.status === 404,
      'Adding copy to nonexistent book returns HTTP 404',
      `Got status ${nonExistentBookRes.status}`
    );

    const invalidCountRes = await librarianClient.request('POST', `/api/books/${book1.id}/copies`, {
      body: { count: 0 },
    });
    assert(
      invalidCountRes.status === 400,
      'Count < 1 is rejected with HTTP 400',
      `Got status ${invalidCountRes.status}`
    );

    const excessiveCountRes = await librarianClient.request('POST', `/api/books/${book1.id}/copies`, {
      body: { count: 100 },
    });
    assert(
      excessiveCountRes.status === 400,
      'Count > 50 is rejected with HTTP 400',
      `Got status ${excessiveCountRes.status}`
    );

    const invalidConditionRes = await librarianClient.request('POST', `/api/books/${book1.id}/copies`, {
      body: { count: 1, condition: 'MINT' },
    });
    assert(
      invalidConditionRes.status === 400,
      'Invalid condition is rejected with HTTP 400',
      `Got status ${invalidConditionRes.status}`
    );

    const multiWithSingleBarcodeRes = await librarianClient.request('POST', `/api/books/${book1.id}/copies`, {
      body: { count: 2, barcode: 'SINGLE-BC-123' },
    });
    assert(
      multiWithSingleBarcodeRes.status === 400,
      'Single barcode with count > 1 is rejected with HTTP 400',
      `Got status ${multiWithSingleBarcodeRes.status}`
    );

    // ---------------------------------------------------------
    // 4. POST /api/books/:id/copies — Adding Copies & Sequential Numbers
    // ---------------------------------------------------------
    const initialBookDetails = await librarianClient.request('GET', `/api/books/${book1.id}`);
    const initialTotalCopies = initialBookDetails.data.book.totalCopies;
    const initialAvailCopies = initialBookDetails.data.book.availableCopies;

    // Add a single copy with auto-generated barcode and custom shelfLocation
    const addSingleRes = await librarianClient.request('POST', `/api/books/${book1.id}/copies`, {
      body: {
        count: 1,
        condition: 'Good',
        shelfLocation: 'Rack B-2-05',
      },
    });
    assert(
      addSingleRes.status === 201,
      'Librarian successfully adds single copy with HTTP 201',
      `Got status ${addSingleRes.status}`
    );

    const addedCopy = addSingleRes.data.copies[0];
    assert(
      addedCopy && addedCopy.copyNumber === 3,
      'Newly added copy receives sequential copyNumber 3',
      `Got copyNumber: ${addedCopy?.copyNumber}`
    );
    assert(
      addedCopy && addedCopy.shelfLocation === 'Rack B-2-05',
      'Copy-level shelfLocation persists accurately',
      `Got shelfLocation: ${addedCopy?.shelfLocation}`
    );
    assert(
      Boolean(addedCopy && addedCopy.barcode && addedCopy.barcode.startsWith('BC-')),
      'Auto-generated barcode is present and correctly formatted',
      `Got barcode: ${addedCopy?.barcode}`
    );

    // Register added copy ID for cleanup
    dataManager.createdCopyIds.add(addedCopy.id);

    // Check parent book counters
    const bookAfterSingleAdd = await librarianClient.request('GET', `/api/books/${book1.id}`);
    assert(
      bookAfterSingleAdd.data.book.totalCopies === initialTotalCopies + 1,
      'Parent book totalCopies incremented by 1',
      `Expected ${initialTotalCopies + 1}, got ${bookAfterSingleAdd.data.book.totalCopies}`
    );
    assert(
      bookAfterSingleAdd.data.book.availableCopies === initialAvailCopies + 1,
      'Parent book availableCopies incremented by 1',
      `Expected ${initialAvailCopies + 1}, got ${bookAfterSingleAdd.data.book.availableCopies}`
    );

    // Check duplicate barcode rejection (HTTP 409)
    const duplicateBarcodeRes = await librarianClient.request('POST', `/api/books/${book1.id}/copies`, {
      body: {
        count: 1,
        barcode: addedCopy.barcode,
      },
    });
    assert(
      duplicateBarcodeRes.status === 409,
      'Duplicate barcode returns HTTP 409 Conflict',
      `Got status ${duplicateBarcodeRes.status}`
    );

    // Batch creation of 2 copies
    const customBarcode1 = `BC-TEST-SPEC-A-${Date.now()}`;
    const customBarcode2 = `BC-TEST-SPEC-B-${Date.now()}`;
    const batchAddRes = await librarianClient.request('POST', `/api/books/${book1.id}/copies`, {
      body: {
        copies: [
          { barcode: customBarcode1, condition: 'Fair', shelfLocation: 'Rack B-2-06' },
          { barcode: customBarcode2, condition: 'Good', shelfLocation: 'Rack B-2-07' },
        ],
      },
    });
    assert(
      batchAddRes.status === 201,
      'Batch copy creation succeeds with HTTP 201',
      `Got status ${batchAddRes.status}`
    );
    assert(
      batchAddRes.data.copies && batchAddRes.data.copies.length === 2,
      'Batch returned 2 created copies',
      `Got length: ${batchAddRes.data.copies?.length}`
    );

    if (batchAddRes.data.copies) {
      batchAddRes.data.copies.forEach((c) => dataManager.createdCopyIds.add(c.id));
    }

    // Audit log verification for copy creation
    const createAudit = await dataManager.prisma.auditLog.findFirst({
      where: { action: 'BOOK_COPY_CREATED', targetId: addedCopy.id },
    });
    assert(
      createAudit !== null,
      'AuditLog recorded BOOK_COPY_CREATED action in transaction',
      'Audit log entry was not found'
    );
    assert(
      createAudit?.actorId === librarian.id,
      'BOOK_COPY_CREATED captures librarian actorId',
      `Expected ${librarian.id}, got ${createAudit?.actorId}`
    );

    // ---------------------------------------------------------
    // 5. PUT /api/books/copies/:copyId — Updating Metadata & Status Guards
    // ---------------------------------------------------------
    // A. Student cannot edit copy
    const studentEditRes = await studentClient.request('PUT', `/api/books/copies/${addedCopy.id}`, {
      body: { condition: 'Poor' },
    });
    assert(
      studentEditRes.status === 403,
      'Student is forbidden from updating copy (HTTP 403)',
      `Got status ${studentEditRes.status}`
    );

    // B. Librarian updates condition and shelf location
    const libEditRes = await librarianClient.request('PUT', `/api/books/copies/${addedCopy.id}`, {
      body: {
        condition: 'Fair',
        shelfLocation: 'Rack C-1-01',
      },
    });
    assert(
      libEditRes.status === 200,
      'Librarian successfully updates copy metadata with HTTP 200',
      `Got status ${libEditRes.status}`
    );
    assert(
      libEditRes.data.copy.condition === 'Fair' && libEditRes.data.copy.shelfLocation === 'Rack C-1-01',
      'Updated condition and shelfLocation persisted correctly',
      `Got condition=${libEditRes.data.copy.condition}, shelfLocation=${libEditRes.data.copy.shelfLocation}`
    );

    // C. Barcode conflict check on update
    const barcodeConflictRes = await librarianClient.request('PUT', `/api/books/copies/${addedCopy.id}`, {
      body: { barcode: customBarcode1 },
    });
    assert(
      barcodeConflictRes.status === 409,
      'Updating barcode to another existing barcode returns HTTP 409',
      `Got status ${barcodeConflictRes.status}`
    );

    // D. Actively issued copy status guard
    // Issue one copy to student
    const activeCopy = batchAddRes.data.copies[0];
    const activeLending = await dataManager.createLending({
      userId: student.id,
      bookCopyId: activeCopy.id,
      status: 'ISSUED',
    });

    const tamperIssuedCopyRes = await librarianClient.request('PUT', `/api/books/copies/${activeCopy.id}`, {
      body: { status: 'AVAILABLE' },
    });
    assert(
      tamperIssuedCopyRes.status === 400,
      'Arbitrarily changing actively issued copy to AVAILABLE is rejected with HTTP 400',
      `Got status ${tamperIssuedCopyRes.status}`
    );

    // ---------------------------------------------------------
    // 6. DELETE /api/books/copies/:copyId — Deletion vs Withdrawal
    // ---------------------------------------------------------
    // A. Actively issued copy cannot be deleted
    const deleteActiveCopyRes = await librarianClient.request('DELETE', `/api/books/copies/${activeCopy.id}`);
    assert(
      deleteActiveCopyRes.status === 400,
      'Deleting an actively issued copy is rejected with HTTP 400',
      `Got status ${deleteActiveCopyRes.status}`
    );

    // B. Hard delete: copy with NO lending history
    const freshCopy = batchAddRes.data.copies[1];
    const hardDeleteRes = await librarianClient.request('DELETE', `/api/books/copies/${freshCopy.id}`);
    assert(
      hardDeleteRes.status === 200,
      'Hard deletion of copy without lending history succeeds with HTTP 200',
      `Got status ${hardDeleteRes.status}`
    );
    assert(
      hardDeleteRes.data.action === 'DELETED',
      'API confirms action: "DELETED"',
      `Got action: ${hardDeleteRes.data.action}`
    );

    // Verify copy is completely removed from database
    const copyInDbAfterDelete = await dataManager.prisma.bookCopy.findUnique({
      where: { id: freshCopy.id },
    });
    assert(
      copyInDbAfterDelete === null,
      'Deleted copy is permanently removed from database',
      'Copy still exists in database'
    );

    // Verify BOOK_COPY_DELETED audit log
    const deleteAudit = await dataManager.prisma.auditLog.findFirst({
      where: { action: 'BOOK_COPY_DELETED', targetId: freshCopy.id },
    });
    assert(
      deleteAudit !== null,
      'AuditLog recorded BOOK_COPY_DELETED action',
      'Audit log entry was not found'
    );

    // C. Soft delete / WITHDRAWN: copy WITH historical lending records
    // Close the active loan for activeCopy so it is no longer ISSUED, but has lending history
    await dataManager.prisma.lending.update({
      where: { id: activeLending.id },
      data: { status: 'RETURNED', returnedDate: new Date() },
    });
    await dataManager.prisma.bookCopy.update({
      where: { id: activeCopy.id },
      data: { status: 'AVAILABLE' },
    });
    await dataManager.prisma.book.update({
      where: { id: book1.id },
      data: { availableCopies: { increment: 1 } },
    });

    const bookBeforeWithdraw = await librarianClient.request('GET', `/api/books/${book1.id}`);
    const totalBeforeWithdraw = bookBeforeWithdraw.data.book.totalCopies;
    const availBeforeWithdraw = bookBeforeWithdraw.data.book.availableCopies;

    const withdrawCopyRes = await librarianClient.request('DELETE', `/api/books/copies/${activeCopy.id}`);
    assert(
      withdrawCopyRes.status === 200,
      'Removing copy with lending history succeeds with HTTP 200',
      `Got status ${withdrawCopyRes.status}`
    );
    assert(
      withdrawCopyRes.data.action === 'WITHDRAWN',
      'API confirms action: "WITHDRAWN" due to historical loans',
      `Got action: ${withdrawCopyRes.data.action}`
    );

    // Verify copy still exists in database with status WITHDRAWN
    const copyInDbAfterWithdraw = await dataManager.prisma.bookCopy.findUnique({
      where: { id: activeCopy.id },
    });
    assert(
      copyInDbAfterWithdraw !== null && copyInDbAfterWithdraw.status === 'WITHDRAWN',
      'Withdrawn copy remains in database with status: "WITHDRAWN"',
      `Got status: ${copyInDbAfterWithdraw?.status}`
    );

    // Verify parent counters decremented
    const bookAfterWithdraw = await librarianClient.request('GET', `/api/books/${book1.id}`);
    assert(
      bookAfterWithdraw.data.book.totalCopies === totalBeforeWithdraw - 1,
      'Parent totalCopies decremented by 1 after copy withdrawal',
      `Expected ${totalBeforeWithdraw - 1}, got ${bookAfterWithdraw.data.book.totalCopies}`
    );
    assert(
      bookAfterWithdraw.data.book.availableCopies === availBeforeWithdraw - 1,
      'Parent availableCopies decremented by 1 after copy withdrawal',
      `Expected ${availBeforeWithdraw - 1}, got ${bookAfterWithdraw.data.book.availableCopies}`
    );

    // Verify BOOK_COPY_WITHDRAWN audit log
    const withdrawAudit = await dataManager.prisma.auditLog.findFirst({
      where: { action: 'BOOK_COPY_WITHDRAWN', targetId: activeCopy.id },
    });
    assert(
      withdrawAudit !== null,
      'AuditLog recorded BOOK_COPY_WITHDRAWN action',
      'Audit log entry was not found'
    );

    // Attempting to delete an already withdrawn copy returns HTTP 400
    const deleteAgainRes = await librarianClient.request('DELETE', `/api/books/copies/${activeCopy.id}`);
    assert(
      deleteAgainRes.status === 400,
      'Attempting to delete already withdrawn copy returns HTTP 400',
      `Got status ${deleteAgainRes.status}`
    );

    // ---------------------------------------------------------
    // 7. Zero Sensitive Secret Key Leakage Check
    // ---------------------------------------------------------
    const leakedInAdd = findLeakedSecrets(addSingleRes.data);
    assert(
      leakedInAdd.length === 0,
      'Zero sensitive security keys leaked in POST /api/books/:id/copies payload',
      `Leaked keys: ${leakedInAdd.join(', ')}`
    );

    const leakedInEdit = findLeakedSecrets(libEditRes.data);
    assert(
      leakedInEdit.length === 0,
      'Zero sensitive security keys leaked in PUT /api/books/copies/:copyId payload',
      `Leaked keys: ${leakedInEdit.join(', ')}`
    );

    const leakedInDelete = findLeakedSecrets(withdrawCopyRes.data);
    assert(
      leakedInDelete.length === 0,
      'Zero sensitive security keys leaked in DELETE /api/books/copies/:copyId payload',
      `Leaked keys: ${leakedInDelete.join(', ')}`
    );
  } finally {
    await dataManager.cleanup();
  }
}
