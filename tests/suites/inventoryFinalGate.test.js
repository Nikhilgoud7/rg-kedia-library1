// tests/suites/inventoryFinalGate.test.js — Phase 6H Physical Inventory Final Quality Gate & End-to-End Lifecycle Suite
import { createApiClient, findLeakedSecrets } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';

export async function runInventoryFinalGateTests(baseUrl, assert) {
  const dataManager = new TestDataManager();

  try {
    // ---------------------------------------------------------
    // 1. Setup Personas & Clients
    // ---------------------------------------------------------
    const librarian = await dataManager.createLibrarian({ tag: 'p6h_lib' });
    const librarianClient = createApiClient(baseUrl);
    librarianClient.loginAs(librarian);

    const teacher = await dataManager.createTeacher({ tag: 'p6h_tch' });
    const teacherClient = createApiClient(baseUrl);
    teacherClient.loginAs(teacher);

    const studentA = await dataManager.createStudent({ tag: 'p6h_stuA' });
    const studentAClient = createApiClient(baseUrl);
    studentAClient.loginAs(studentA);

    const studentB = await dataManager.createStudent({ tag: 'p6h_stuB' });
    const studentBClient = createApiClient(baseUrl);
    studentBClient.loginAs(studentB);

    const unauthClient = createApiClient(baseUrl);

    // ---------------------------------------------------------
    // 2. Lifecycle: Create Parent Book & Batch Add Copies
    // ---------------------------------------------------------
    const createBookRes = await librarianClient.request('POST', '/api/books', {
      body: {
        title: 'Advanced Corporate Law and Governance',
        author: 'Prof. R. G. Kedia',
        isbn: '978-93-89999-01-5',
        publisher: 'Kedia Academic Press',
        edition: '4th Edition',
        publicationYear: 2024,
        category: 'TEXTBOOK',
        segment: 'Business & Management',
        description: 'Comprehensive corporate law treatise for B.Com and BBA students.',
        totalCopies: 2,
        shelfLocation: 'Rack Commerce-G1',
        programs: [{ program: 'BCOM', branch: 'General' }],
      },
    });
    assert(createBookRes.status === 201, 'Parent book created with HTTP 201');
    const bookId = createBookRes.body?.book?.id;
    assert(Boolean(bookId), 'Created book has valid id');
    dataManager.createdBookIds.add(bookId);

    // Fetch initial 2 copies
    const initialCopies = await dataManager.prisma.bookCopy.findMany({
      where: { bookId },
      orderBy: { copyNumber: 'asc' },
    });
    assert(initialCopies.length === 2, 'Initial 2 physical copies created with book');
    const copy1 = initialCopies[0];
    const copy2 = initialCopies[1];

    // Assign barcode to copy 1 and copy 2 via PUT /api/books/copies/:copyId
    const updateC1Res = await librarianClient.request('PUT', `/api/books/copies/${copy1.id}`, {
      body: { barcode: `BC-CLAW-001-${Date.now().toString(36).toUpperCase()}` },
    });
    assert(updateC1Res.status === 200, 'Assigned barcode to copy 1');
    const copy1Barcode = updateC1Res.body?.copy?.barcode;

    const updateC2Res = await librarianClient.request('PUT', `/api/books/copies/${copy2.id}`, {
      body: { barcode: `BC-CLAW-002-${Date.now().toString(36).toUpperCase()}` },
    });
    assert(updateC2Res.status === 200, 'Assigned barcode to copy 2');
    const copy2Barcode = updateC2Res.body?.copy?.barcode;

    // Batch add 3 physical copies with auto-generated barcodes (total becomes 5)
    const addBatchCopiesRes = await librarianClient.request('POST', `/api/books/${bookId}/copies`, {
      body: {
        count: 3,
        condition: 'Good',
        shelfLocation: 'Rack Commerce-G1',
      },
    });
    assert(addBatchCopiesRes.status === 201, 'Batch added 3 physical copies with HTTP 201');
    assert(addBatchCopiesRes.body?.copies?.length === 3, 'Batch returned 3 created physical copies');

    // Fetch all 5 copies from database
    const allCopies = await dataManager.prisma.bookCopy.findMany({
      where: { bookId },
      orderBy: { copyNumber: 'asc' },
    });
    assert(allCopies.length === 5, 'Parent book has exactly 5 physical copies in database');
    const copy3 = allCopies[2];
    const copy4 = allCopies[3];
    const copy5 = allCopies[4];

    // ---------------------------------------------------------
    // 3. Edit Physical Copy Metadata
    // ---------------------------------------------------------
    const updateCopyRes = await librarianClient.request('PUT', `/api/books/copies/${copy3.id}`, {
      body: {
        condition: 'Fair',
        shelfLocation: 'Reserve Section R-02',
      },
    });
    assert(updateCopyRes.status === 200, 'Librarian updated copy 3 metadata with HTTP 200');
    assert(updateCopyRes.body?.copy?.condition === 'Fair', 'Updated condition persisted');
    assert(updateCopyRes.body?.copy?.shelfLocation === 'Reserve Section R-02', 'Updated shelfLocation persisted');

    // ---------------------------------------------------------
    // 4. Intentional Drift Simulation & Reconciliation Engine Verification
    // ---------------------------------------------------------
    // Manually skew parent book counters in database to simulate counter drift
    await dataManager.prisma.book.update({
      where: { id: bookId },
      data: { totalCopies: 99, availableCopies: 77 },
    });

    // Run reconciliation on the drifted book
    const reconcileRes = await librarianClient.request('POST', `/api/books/${bookId}/reconcile`);
    assert(reconcileRes.status === 200, 'Reconciliation endpoint succeeds with HTTP 200');
    assert(reconcileRes.body?.result?.reconciled === true, 'Reconciliation engine accurately detected counter drift');
    assert(reconcileRes.body?.result?.correctedTotalCopies === 5, 'Parent totalCopies accurately repaired to 5');
    assert(reconcileRes.body?.result?.correctedAvailableCopies === 5, 'Parent availableCopies accurately repaired to 5');

    // Verify audit log for reconciliation
    const reconAudit = await dataManager.prisma.auditLog.findFirst({
      where: { targetId: bookId, action: 'INVENTORY_RECONCILED' },
      orderBy: { timestamp: 'desc' },
    });
    assert(Boolean(reconAudit), 'AuditLog recorded INVENTORY_RECONCILED action');

    // ---------------------------------------------------------
    // 5. Circulation Flow: Specific Barcode Loan Approval
    // ---------------------------------------------------------
    const borrowReqA = await dataManager.createBookRequest({
      userId: studentA.id,
      bookId,
      status: 'PENDING',
      type: 'BORROW',
    });

    const approveLoanARes = await librarianClient.request('POST', `/api/lending/approve/${borrowReqA.id}`, {
      body: { bookCopyId: copy1.id, barcode: copy1Barcode, daysToReturn: 21 },
    });
    assert(approveLoanARes.status === 200, 'Loan approved allocating copy 1 by barcode with HTTP 200');
    assert(approveLoanARes.body?.lending?.bookCopyId === copy1.id, 'Loan mapped to specified copy 1');

    // Verify parent availableCopies decremented to 4
    const bookAfterLoanA = await dataManager.prisma.book.findUnique({ where: { id: bookId } });
    assert(bookAfterLoanA?.availableCopies === 4, 'Parent availableCopies decremented to 4');

    // ---------------------------------------------------------
    // 6. Cross-Persona Visibility: Student & Teacher Views
    // ---------------------------------------------------------
    // Student A checks own borrowings
    const studentABooksRes = await studentAClient.request('GET', '/api/lending/my-books?status=ISSUED');
    assert(studentABooksRes.status === 200, 'Student A fetches own loans with HTTP 200');
    assert(studentABooksRes.body?.lendings?.[0]?.bookCopy?.barcode === copy1Barcode, 'Student A sees assigned barcode');

    // Teacher checks book detail
    const teacherDetailRes = await teacherClient.request('GET', `/api/books/${bookId}`);
    assert(teacherDetailRes.status === 200, 'Teacher fetches book details with HTTP 200');
    const teacherCopy1 = teacherDetailRes.body?.book?.copies?.find((c) => c.id === copy1.id);
    assert(
      teacherCopy1?.lendings?.[0]?.user?.rollNumber === studentA.rollNumber,
      'Teacher view identifies borrower roll number for copy 1'
    );
    assert(teacherCopy1?.lendings?.[0]?.user?.phone === undefined, 'Teacher view omits borrower phone');

    // ---------------------------------------------------------
    // 7. Barcode Quick-Lookup & Quick-Return (Settlement)
    // ---------------------------------------------------------
    const lookupRes = await librarianClient.request('GET', `/api/lending/lookup-barcode/${copy1Barcode}`);
    assert(lookupRes.status === 200, 'Barcode lookup succeeds with HTTP 200');
    assert(lookupRes.body?.activeLending?.borrower?.name === studentA.name, 'Lookup identifies active borrower');

    // Return copy 1 via barcode
    const returnRes = await librarianClient.request('POST', '/api/lending/return-by-barcode', {
      body: {
        barcode: copy1Barcode,
        resolution: 'RETURNED',
        notes: 'Returned at circulation desk in good condition.',
      },
    });
    assert(returnRes.status === 200, 'Return by barcode succeeds with HTTP 200');
    assert(returnRes.body?.fine === 0, 'Zero fine assessed on return');
    assert(returnRes.body?.copyStatus === 'AVAILABLE', 'Copy 1 status restored to AVAILABLE');

    // Verify parent availableCopies restored to 5
    const bookAfterReturn = await dataManager.prisma.book.findUnique({ where: { id: bookId } });
    assert(bookAfterReturn?.availableCopies === 5, 'Parent availableCopies restored to 5');

    // ---------------------------------------------------------
    // 8. Lost Settlement via Barcode (College Zero-Fine Policy)
    // ---------------------------------------------------------
    const borrowReqB = await dataManager.createBookRequest({
      userId: studentB.id,
      bookId,
      status: 'PENDING',
      type: 'BORROW',
    });

    const approveLoanBRes = await librarianClient.request('POST', `/api/lending/approve/${borrowReqB.id}`, {
      body: { bookCopyId: copy2.id, barcode: copy2Barcode, daysToReturn: 30 },
    });
    assert(approveLoanBRes.status === 200, 'Loan approved allocating copy 2');

    // Settle copy 2 as LOST via barcode
    const lostRes = await librarianClient.request('POST', '/api/lending/return-by-barcode', {
      body: {
        barcode: copy2Barcode,
        resolution: 'LOST',
        notes: 'Student reported book lost during commute.',
      },
    });
    assert(lostRes.status === 200, 'Settled as LOST via barcode with HTTP 200');
    assert(lostRes.body?.fine === 0, 'Zero fine policy enforced on LOST settlement');
    assert(lostRes.body?.copyStatus === 'LOST', 'Copy 2 marked LOST');

    // Verify parent counters: totalCopies remains 5, availableCopies is 4
    const bookAfterLost = await dataManager.prisma.book.findUnique({ where: { id: bookId } });
    assert(bookAfterLost?.totalCopies === 5, 'Parent totalCopies remains 5 after lost settlement');
    assert(bookAfterLost?.availableCopies === 4, 'Parent availableCopies is 4 after lost settlement');

    // ---------------------------------------------------------
    // 9. Soft-Withdrawal & Hard-Deletion Protection
    // ---------------------------------------------------------
    // Attempting to delete copy 2 (has historical loan) -> soft-withdrawn
    const withdrawCopyRes = await librarianClient.request('DELETE', `/api/books/copies/${copy2.id}`);
    assert(withdrawCopyRes.status === 200, 'Deleting historical copy succeeds with HTTP 200');
    assert(withdrawCopyRes.body?.action === 'WITHDRAWN', 'Historical copy is safely WITHDRAWN (not hard-deleted)');
    assert(withdrawCopyRes.body?.copy?.status === 'WITHDRAWN', 'Status is WITHDRAWN');

    // Deleting copy 5 (never borrowed) -> permanently deleted
    const deleteCopyRes = await librarianClient.request('DELETE', `/api/books/copies/${copy5.id}`);
    assert(deleteCopyRes.status === 200, 'Deleting unborrowed copy succeeds with HTTP 200');
    assert(deleteCopyRes.body?.action === 'DELETED', 'Unborrowed copy is permanently DELETED');

    // Verify copy 5 is no longer in database
    const copy5Db = await dataManager.prisma.bookCopy.findUnique({ where: { id: copy5.id } });
    assert(copy5Db === null, 'Copy 5 completely removed from database');

    // Final reconciliation check
    const bulkReconcileRes = await librarianClient.request('POST', '/api/books/inventory/reconcile');
    assert(bulkReconcileRes.status === 200, 'Bulk inventory reconciliation succeeds with HTTP 200');
    assert(bulkReconcileRes.body?.summary?.booksFailed === 0, 'Zero reconciliation failures across entire database');

    // ---------------------------------------------------------
    // 10. Security & Privacy Audit
    // ---------------------------------------------------------
    assert(
      findLeakedSecrets(createBookRes.body).length === 0,
      'Zero secrets in createBook response'
    );
    assert(
      findLeakedSecrets(approveLoanARes.body).length === 0,
      'Zero secrets in approveLoan response'
    );
    assert(
      findLeakedSecrets(lookupRes.body).length === 0,
      'Zero secrets in lookup response'
    );
    assert(
      findLeakedSecrets(returnRes.body).length === 0,
      'Zero secrets in return response'
    );
    assert(
      findLeakedSecrets(lostRes.body).length === 0,
      'Zero secrets in lost response'
    );
  } finally {
    await dataManager.cleanup();
  }
}
