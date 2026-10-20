// tests/suites/inventoryCirculation.test.js — Phase 6F Real Inventory Circulation Integration & Barcode Operations Suite
import { createApiClient, findLeakedSecrets } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';

export async function runInventoryCirculationTests(baseUrl, assert) {
  const dataManager = new TestDataManager();

  try {
    // ---------------------------------------------------------
    // 1. Personas & API Clients Setup
    // ---------------------------------------------------------
    const librarian = await dataManager.createLibrarian({ tag: 'p6f_lib' });
    const librarianClient = createApiClient(baseUrl);
    librarianClient.loginAs(librarian);

    const studentA = await dataManager.createStudent({ tag: 'p6f_stuA' });
    const studentAClient = createApiClient(baseUrl);
    studentAClient.loginAs(studentA);

    const studentB = await dataManager.createStudent({ tag: 'p6f_stuB' });
    const studentBClient = createApiClient(baseUrl);
    studentBClient.loginAs(studentB);

    const teacher = await dataManager.createTeacher({ tag: 'p6f_tch' });
    const teacherClient = createApiClient(baseUrl);
    teacherClient.loginAs(teacher);

    const unauthClient = createApiClient(baseUrl);

    // Create test book1 with 3 physical copies
    const book1 = await dataManager.createBook({
      title: 'Circulation & Barcode Integration Volume',
      totalCopies: 3,
      tag: 'p6f_b1',
    });

    const book1Copies = await dataManager.prisma.bookCopy.findMany({
      where: { bookId: book1.id },
      orderBy: { copyNumber: 'asc' },
    });
    assert(book1Copies.length === 3, 'Book 1 initialized with exactly 3 copies');
    const copy1 = book1Copies[0];
    const copy2 = book1Copies[1];
    const copy3 = book1Copies[2];

    // Create test book2 (separate book) with 1 copy
    const book2 = await dataManager.createBook({
      title: 'Separate Departmental Volume',
      totalCopies: 1,
      tag: 'p6f_b2',
    });
    const book2Copies = await dataManager.prisma.bookCopy.findMany({
      where: { bookId: book2.id },
    });
    const copyBook2 = book2Copies[0];

    // ---------------------------------------------------------
    // 2. Barcode-Specific Lending Approval (Step 2)
    // ---------------------------------------------------------

    // 2.1 Rejection: Non-existent barcode
    const req1 = await dataManager.createBookRequest({
      userId: studentA.id,
      bookId: book1.id,
      status: 'PENDING',
      type: 'BORROW',
    });

    const nonExistentBarcodeRes = await librarianClient.request('POST', `/api/lending/approve/${req1.id}`, {
      body: { barcode: 'BC-NONEXISTENT-99999' },
    });
    assert(
      nonExistentBarcodeRes.status === 404,
      'Approval with non-existent barcode is rejected with HTTP 404',
      `Got status ${nonExistentBarcodeRes.status}`
    );

    // 2.2 Rejection: bookCopyId and barcode mismatch
    const mismatchRes = await librarianClient.request('POST', `/api/lending/approve/${req1.id}`, {
      body: { bookCopyId: copy1.id, barcode: copy2.barcode },
    });
    assert(
      mismatchRes.status === 400,
      'Approval with mismatched bookCopyId and barcode is rejected with HTTP 400'
    );
    assert(
      mismatchRes.body?.error?.toLowerCase().includes('do not identify the same copy'),
      'Mismatch error explains conflicting copy identifiers'
    );

    // 2.3 Rejection: Copy belonging to another book
    const otherBookCopyRes = await librarianClient.request('POST', `/api/lending/approve/${req1.id}`, {
      body: { barcode: copyBook2.barcode },
    });
    assert(
      otherBookCopyRes.status === 400,
      'Approval with copy belonging to another book is rejected with HTTP 400'
    );
    assert(
      otherBookCopyRes.body?.error?.toLowerCase().includes('does not belong to the requested book'),
      'Copy mismatch error explains book ownership restriction'
    );

    // 2.4 Rejection: Unissued LOST, DAMAGED, or WITHDRAWN copy
    await dataManager.prisma.bookCopy.update({
      where: { id: copy1.id },
      data: { status: 'LOST' },
    });

    const lostCopyRes = await librarianClient.request('POST', `/api/lending/approve/${req1.id}`, {
      body: { barcode: copy1.barcode },
    });
    assert(
      lostCopyRes.status === 400,
      'Approval allocating a LOST copy is rejected with HTTP 400'
    );
    assert(
      lostCopyRes.body?.error?.toLowerCase().includes('not available'),
      'Allocation error identifies copy is not available'
    );

    // Restore copy1 to AVAILABLE for subsequent clean tests
    await dataManager.prisma.bookCopy.update({
      where: { id: copy1.id },
      data: { status: 'AVAILABLE' },
    });

    // 2.5 Successful Approval using valid barcode
    const validBarcodeApprovalRes = await librarianClient.request('POST', `/api/lending/approve/${req1.id}`, {
      body: { barcode: copy1.barcode, daysToReturn: 21 },
    });
    assert(
      validBarcodeApprovalRes.status === 200,
      'Approval with valid copy barcode succeeds with HTTP 200',
      `Got status ${validBarcodeApprovalRes.status}: ${validBarcodeApprovalRes.body?.error}`
    );
    assert(
      validBarcodeApprovalRes.body?.lending?.bookCopyId === copy1.id,
      'Lending is explicitly associated with the specified copy1'
    );

    // Verify copy1 is now ISSUED in database
    const copy1Db = await dataManager.prisma.bookCopy.findUnique({ where: { id: copy1.id } });
    assert(copy1Db?.status === 'ISSUED', 'Target copy status updated to ISSUED in database');

    // 2.6 Rejection: Already-issued copy
    const req2 = await dataManager.createBookRequest({
      userId: studentB.id,
      bookId: book1.id,
      status: 'PENDING',
      type: 'BORROW',
    });

    const alreadyIssuedCopyRes = await librarianClient.request('POST', `/api/lending/approve/${req2.id}`, {
      body: { barcode: copy1.barcode },
    });
    assert(
      alreadyIssuedCopyRes.status === 400,
      'Approval allocating an already ISSUED copy is rejected with HTTP 400'
    );

    // 2.7 Successful Approval using valid bookCopyId
    const validCopyIdApprovalRes = await librarianClient.request('POST', `/api/lending/approve/${req2.id}`, {
      body: { bookCopyId: copy2.id },
    });
    assert(
      validCopyIdApprovalRes.status === 200,
      'Approval with valid bookCopyId succeeds with HTTP 200'
    );
    assert(
      validCopyIdApprovalRes.body?.lending?.bookCopyId === copy2.id,
      'Lending is explicitly associated with specified copy2'
    );

    // 2.8 Both identifiers matching the same copy succeeds
    const studentC = await dataManager.createStudent({ tag: 'p6f_stuC' });
    const req3 = await dataManager.createBookRequest({
      userId: studentC.id,
      bookId: book1.id,
      status: 'PENDING',
      type: 'BORROW',
    });

    const matchingBothRes = await librarianClient.request('POST', `/api/lending/approve/${req3.id}`, {
      body: { bookCopyId: copy3.id, barcode: copy3.barcode },
    });
    assert(
      matchingBothRes.status === 200,
      'Approval specifying both matching bookCopyId and barcode succeeds with HTTP 200'
    );

    // 2.9 Existing fallback auto-allocation remains intact when no copy/barcode provided
    const book3 = await dataManager.createBook({
      title: 'Auto-Allocation Fallback Book',
      totalCopies: 1,
      tag: 'p6f_b3',
    });
    const studentD = await dataManager.createStudent({ tag: 'p6f_stuD' });
    const req4 = await dataManager.createBookRequest({
      userId: studentD.id,
      bookId: book3.id,
      status: 'PENDING',
      type: 'BORROW',
    });

    const fallbackApproveRes = await librarianClient.request('POST', `/api/lending/approve/${req4.id}`, {
      body: {},
    });
    assert(
      fallbackApproveRes.status === 200,
      'Fallback auto-allocation without barcode/copyId succeeds with HTTP 200'
    );
    assert(
      Boolean(fallbackApproveRes.body?.lending?.bookCopyId),
      'Fallback allocation automatically assigned an available copy'
    );

    // ---------------------------------------------------------
    // 3. Barcode Search in Active Lendings (Step 3)
    // ---------------------------------------------------------
    // Search by exact barcode of copy1
    const exactBarcodeSearchRes = await librarianClient.request('GET', `/api/lending/all?search=${copy1.barcode}`);
    assert(exactBarcodeSearchRes.status === 200, 'GET /api/lending/all with search succeeds');
    assert(
      exactBarcodeSearchRes.body?.lendings?.some((l) => l.bookCopy?.barcode === copy1.barcode),
      'Lending queue search locates active loan by exact barcode'
    );

    // Search by lowercase barcode (case-insensitivity test)
    const lowerBarcodeSearchRes = await librarianClient.request(
      'GET',
      `/api/lending/all?search=${copy1.barcode.toLowerCase()}`
    );
    assert(
      lowerBarcodeSearchRes.body?.lendings?.some((l) => l.bookCopy?.barcode === copy1.barcode),
      'Lending queue search is case-insensitive for copy barcodes'
    );

    // Search by unmatched barcode returns 0 items
    const noMatchSearchRes = await librarianClient.request(
      'GET',
      '/api/lending/all?search=BC-COMPLETELY-UNMATCHED-XYZ'
    );
    assert(
      noMatchSearchRes.body?.lendings?.length === 0,
      'Search with unmatched barcode returns 0 lendings'
    );

    // Existing borrower roll number search still functional
    const rollNumberSearchRes = await librarianClient.request(
      'GET',
      `/api/lending/all?search=${studentA.rollNumber}`
    );
    assert(
      rollNumberSearchRes.body?.lendings?.some((l) => l.user?.rollNumber === studentA.rollNumber),
      'Search by student rollNumber continues to work seamlessly'
    );

    // ---------------------------------------------------------
    // 4. Barcode Quick Lookup (Step 4A)
    // ---------------------------------------------------------
    // 4.1 Lookup actively issued copy
    const activeLookupRes = await librarianClient.request('GET', `/api/lending/lookup-barcode/${copy1.barcode}`);
    assert(activeLookupRes.status === 200, 'GET /api/lending/lookup-barcode/:barcode succeeds with HTTP 200');
    assert(activeLookupRes.body?.copy?.barcode === copy1.barcode, 'Lookup returns correct copy barcode');
    assert(activeLookupRes.body?.copy?.status === 'ISSUED', 'Lookup returns copy status as ISSUED');
    assert(Boolean(activeLookupRes.body?.activeLending), 'Lookup identifies active lending details');
    assert(activeLookupRes.body?.activeLending?.borrower?.name === studentA.name, 'Lookup identifies correct borrower name');

    // 4.2 Lookup available unissued copy
    const book4 = await dataManager.createBook({
      title: 'Shelf Inventory Lookup Volume',
      totalCopies: 1,
      tag: 'p6f_b4',
    });
    const book4Copies = await dataManager.prisma.bookCopy.findMany({ where: { bookId: book4.id } });
    const availableCopy = book4Copies[0];

    const availableLookupRes = await librarianClient.request('GET', `/api/lending/lookup-barcode/${availableCopy.barcode}`);
    assert(availableLookupRes.status === 200, 'Lookup for available copy succeeds with HTTP 200');
    assert(availableLookupRes.body?.copy?.status === 'AVAILABLE', 'Lookup returns AVAILABLE status');
    assert(availableLookupRes.body?.activeLending === null, 'Lookup confirms activeLending is null for unissued copy');

    // 4.3 Lookup non-existent barcode
    const notFoundLookupRes = await librarianClient.request('GET', '/api/lending/lookup-barcode/BC-FAKE-000');
    assert(notFoundLookupRes.status === 404, 'Lookup for non-existent barcode returns HTTP 404');

    // 4.4 RBAC: Student forbidden from barcode lookup
    const studentLookupRes = await studentAClient.request('GET', `/api/lending/lookup-barcode/${copy1.barcode}`);
    assert(studentLookupRes.status === 403, 'Student is forbidden from barcode lookup (HTTP 403)');

    // 4.5 RBAC: Unauthenticated user rejected
    const unauthLookupRes = await unauthClient.request('GET', `/api/lending/lookup-barcode/${copy1.barcode}`);
    assert(unauthLookupRes.status === 401, 'Unauthenticated user is rejected with HTTP 401');

    // 4.6 Security: Zero secrets leaked in lookup response
    const leakedLookupSecrets = findLeakedSecrets(activeLookupRes.body);
    assert(leakedLookupSecrets.length === 0, 'Zero sensitive secrets leaked in barcode lookup payload');

    // ---------------------------------------------------------
    // 5. Barcode Quick Return & Settlement (Step 4B)
    // ---------------------------------------------------------
    // 5.1 Normal return via barcode
    const barcodeReturnRes = await librarianClient.request('POST', '/api/lending/return-by-barcode', {
      body: {
        barcode: copy1.barcode,
        resolution: 'RETURNED',
        condition: 'Good',
        notes: 'Returned at circulation desk via barcode scanner.',
      },
    });
    assert(barcodeReturnRes.status === 200, 'POST /api/lending/return-by-barcode succeeds with HTTP 200');
    assert(barcodeReturnRes.body?.fine === 0, 'Zero fine assessed on barcode return');
    assert(barcodeReturnRes.body?.copyStatus === 'AVAILABLE', 'Copy status restored to AVAILABLE');

    // Verify copy1 in database is AVAILABLE
    const returnedCopy1Db = await dataManager.prisma.bookCopy.findUnique({ where: { id: copy1.id } });
    assert(returnedCopy1Db?.status === 'AVAILABLE', 'Copy1 status updated to AVAILABLE in DB');

    // Audit log verification for barcode return
    const returnAudit = await dataManager.prisma.auditLog.findFirst({
      where: {
        actorId: librarian.id,
        action: 'LENDING_RETURNED',
      },
      orderBy: { timestamp: 'desc' },
    });
    assert(Boolean(returnAudit), 'AuditLog recorded LENDING_RETURNED action for barcode return');

    // 5.2 Attempt return on already-returned copy barcode
    const alreadyReturnedBarcodeRes = await librarianClient.request('POST', '/api/lending/return-by-barcode', {
      body: { barcode: copy1.barcode },
    });
    assert(
      alreadyReturnedBarcodeRes.status === 400,
      'Attempting return on already-returned copy returns HTTP 400'
    );

    // 5.3 Settle active loan as LOST via barcode
    const barcodeLostRes = await librarianClient.request('POST', '/api/lending/return-by-barcode', {
      body: {
        barcode: copy2.barcode,
        resolution: 'LOST',
        notes: 'Borrower reported physical book lost on campus.',
      },
    });
    assert(barcodeLostRes.status === 200, 'Settling active loan as LOST via barcode succeeds with HTTP 200');
    assert(barcodeLostRes.body?.copyStatus === 'LOST', 'Copy status updated to LOST');
    assert(barcodeLostRes.body?.fine === 0, 'Zero fine assessed under college policy for LOST settlement');

    // 5.4 Settle active loan as DAMAGED via barcode
    const barcodeDamagedRes = await librarianClient.request('POST', '/api/lending/return-by-barcode', {
      body: {
        barcode: copy3.barcode,
        resolution: 'DAMAGED',
        condition: 'Poor',
        notes: 'Water damage on pages.',
      },
    });
    assert(barcodeDamagedRes.status === 200, 'Settling active loan as DAMAGED via barcode succeeds with HTTP 200');
    assert(barcodeDamagedRes.body?.copyStatus === 'DAMAGED', 'Copy status updated to DAMAGED');
    assert(barcodeDamagedRes.body?.copy?.condition === 'Poor', 'Copy condition updated to Poor');

    // 5.5 Rejection: Invalid resolution
    const invalidResRes = await librarianClient.request('POST', '/api/lending/return-by-barcode', {
      body: { barcode: copy3.barcode, resolution: 'DESTROYED' },
    });
    assert(invalidResRes.status === 400, 'Invalid resolution rejected with HTTP 400');

    // 5.6 Rejection: Missing barcode
    const missingBarcodeRes = await librarianClient.request('POST', '/api/lending/return-by-barcode', {
      body: { resolution: 'RETURNED' },
    });
    assert(missingBarcodeRes.status === 400, 'Missing barcode rejected with HTTP 400');

    // 5.7 RBAC: Student forbidden from barcode return
    const studentBarcodeReturnRes = await studentAClient.request('POST', '/api/lending/return-by-barcode', {
      body: { barcode: copy1.barcode },
    });
    assert(studentBarcodeReturnRes.status === 403, 'Student is forbidden from returning book by barcode (HTTP 403)');

    // ---------------------------------------------------------
    // 6. Teacher Catalog Accuracy Verification (Step 7)
    // ---------------------------------------------------------
    // In book1:
    // copy1: AVAILABLE
    // copy2: LOST
    // copy3: DAMAGED
    // totalCopies: 3, availableCopies: 1, active ISSUED loans: 0
    const teacherBookViewRes = await teacherClient.request('GET', `/api/books/${book1.id}`);
    assert(teacherBookViewRes.status === 200, 'Teacher can fetch book detail');
    const teacherCopies = teacherBookViewRes.body?.book?.copies || [];
    assert(teacherCopies.length === 3, 'Teacher view contains all 3 copies');

    const copyStatusMap = Object.fromEntries(teacherCopies.map((c) => [c.id, c.status]));
    assert(copyStatusMap[copy1.id] === 'AVAILABLE', 'Teacher view accurately reports copy1 as AVAILABLE');
    assert(copyStatusMap[copy2.id] === 'LOST', 'Teacher view accurately reports copy2 as LOST');
    assert(copyStatusMap[copy3.id] === 'DAMAGED', 'Teacher view accurately reports copy3 as DAMAGED');

    // Confirm that none of the non-available copies have active lendings
    const lostCopy = teacherCopies.find((c) => c.id === copy2.id);
    assert(
      !lostCopy?.lendings || lostCopy.lendings.length === 0,
      'LOST copy has zero active lendings attached in teacher view'
    );
  } finally {
    await dataManager.cleanup();
  }
}
