// tests/suites/lostDamaged.test.js — Phase 6D Zero-Fine Lost & Damaged Workflows Suite
import { createApiClient, findLeakedSecrets } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';

export async function runLostDamagedTests(baseUrl, assert) {
  const dataManager = new TestDataManager();

  try {
    // ---------------------------------------------------------
    // 1. Setup Personas & Clients
    // ---------------------------------------------------------
    const librarian = await dataManager.createLibrarian({ tag: 'ld_lib' });
    const librarianClient = createApiClient(baseUrl);
    librarianClient.loginAs(librarian);

    const teacher = await dataManager.createTeacher({ tag: 'ld_tch' });
    const teacherClient = createApiClient(baseUrl);
    teacherClient.loginAs(teacher);

    const studentA = await dataManager.createStudent({ tag: 'ld_stu_a' });
    const studentAClient = createApiClient(baseUrl);
    studentAClient.loginAs(studentA);

    const studentB = await dataManager.createStudent({ tag: 'ld_stu_b' });
    const studentBClient = createApiClient(baseUrl);
    studentBClient.loginAs(studentB);

    const unauthClient = createApiClient(baseUrl);

    // Initial test book with 4 copies
    const book1 = await dataManager.createBook({
      title: 'Zero-Fine Lost & Damaged Inventory Book',
      totalCopies: 4,
      tag: 'ld1',
    });

    const copies = await dataManager.prisma.bookCopy.findMany({
      where: { bookId: book1.id },
      orderBy: { copyNumber: 'asc' },
    });
    assert(copies.length === 4, 'Initial book has 4 physical copies');

    // Issue copy 0 to studentA
    const lending1 = await dataManager.createLending({
      userId: studentA.id,
      bookCopyId: copies[0].id,
      status: 'ISSUED',
    });
    // Align initial book availableCopies
    await dataManager.prisma.book.update({
      where: { id: book1.id },
      data: { availableCopies: 3 },
    });

    // ---------------------------------------------------------
    // 2. Authorization Gates on POST /api/lending/return/:id
    // ---------------------------------------------------------
    const unauthRes = await unauthClient.request('POST', `/api/lending/return/${lending1.id}`, {
      body: { resolution: 'LOST' },
    });
    assert(
      unauthRes.status === 401,
      'Unauthenticated request to settle lending is rejected with HTTP 401',
      `Got status ${unauthRes.status}`
    );

    const studentRes = await studentAClient.request('POST', `/api/lending/return/${lending1.id}`, {
      body: { resolution: 'LOST' },
    });
    assert(
      studentRes.status === 403,
      'Student request to settle lending is forbidden with HTTP 403',
      `Got status ${studentRes.status}`
    );

    const teacherRes = await teacherClient.request('POST', `/api/lending/return/${lending1.id}`, {
      body: { resolution: 'LOST' },
    });
    assert(
      teacherRes.status === 403,
      'Teacher request to settle lending is forbidden with HTTP 403',
      `Got status ${teacherRes.status}`
    );

    // ---------------------------------------------------------
    // 3. Validation: Invalid Resolution, Condition, & Notes Length
    // ---------------------------------------------------------
    const invalidResRes = await librarianClient.request('POST', `/api/lending/return/${lending1.id}`, {
      body: { resolution: 'UNKNOWN_STATUS' },
    });
    assert(
      invalidResRes.status === 400,
      'Invalid settlement resolution is rejected with HTTP 400',
      `Got status ${invalidResRes.status}: ${invalidResRes.body?.error}`
    );

    const invalidCondRes = await librarianClient.request('POST', `/api/lending/return/${lending1.id}`, {
      body: { resolution: 'DAMAGED', condition: 'InvalidCondition' },
    });
    assert(
      invalidCondRes.status === 400,
      'Invalid condition string for DAMAGED settlement is rejected with HTTP 400',
      `Got status ${invalidCondRes.status}: ${invalidCondRes.body?.error}`
    );

    const longNotes = 'X'.repeat(501);
    const longNotesRes = await librarianClient.request('POST', `/api/lending/return/${lending1.id}`, {
      body: { resolution: 'LOST', notes: longNotes },
    });
    assert(
      longNotesRes.status === 400,
      'Settlement notes exceeding 500 characters rejected with HTTP 400',
      `Got status ${longNotesRes.status}: ${longNotesRes.body?.error}`
    );

    // ---------------------------------------------------------
    // 4. Active Loan Settle as LOST (Zero-Fine Policy Verification)
    // ---------------------------------------------------------
    const lostNotes = 'Book reported lost by student during commute.';
    const settleLostRes = await librarianClient.request('POST', `/api/lending/return/${lending1.id}`, {
      body: {
        resolution: 'LOST',
        notes: lostNotes,
      },
    });
    assert(
      settleLostRes.status === 200,
      'Librarian successfully settles active loan as LOST with HTTP 200',
      `Got status ${settleLostRes.status}: ${settleLostRes.body?.error}`
    );
    assert(
      settleLostRes.body?.fine === 0,
      'Settled LOST loan has fine strictly equal to 0 in API response',
      `Expected fine 0, got ${settleLostRes.body?.fine}`
    );
    assert(
      settleLostRes.body?.copyStatus === 'LOST',
      'API response indicates copyStatus is LOST',
      `Expected LOST, got ${settleLostRes.body?.copyStatus}`
    );

    // Verify Database State for settled loan & copy
    const dbLostLending = await dataManager.prisma.lending.findUnique({
      where: { id: lending1.id },
      include: { bookCopy: true },
    });
    assert(dbLostLending?.status === 'RETURNED', 'Loan status is updated to RETURNED');
    assert(dbLostLending?.returnedDate !== null, 'Loan returnedDate is populated');
    assert(dbLostLending?.fine === 0, 'Loan fine in database is strictly 0');
    assert(dbLostLending?.notes === lostNotes, 'Loan notes are saved in database');
    assert(dbLostLending?.bookCopy?.status === 'LOST', 'Physical BookCopy status is set to LOST');

    // Verify Notification to Borrower with zero-fine message
    const lostNotification = await dataManager.prisma.notification.findFirst({
      where: {
        userId: studentA.id,
        title: 'Book Reported Lost',
      },
      orderBy: { createdAt: 'desc' },
    });
    assert(Boolean(lostNotification), 'Borrower received "Book Reported Lost" notification');
    assert(
      lostNotification?.message?.includes('Under college policy, no monetary fines are assessed.'),
      'Notification message explicitly states zero-fine college policy: "Under college policy, no monetary fines are assessed."',
      `Got message: ${lostNotification?.message}`
    );

    // Verify Audit Log for LOST settlement
    const lostAuditLog = await dataManager.prisma.auditLog.findFirst({
      where: {
        targetId: copies[0].id,
        action: 'BOOK_COPY_LOST',
      },
      orderBy: { timestamp: 'desc' },
    });
    assert(Boolean(lostAuditLog), 'Transactional audit log with action BOOK_COPY_LOST was recorded');

    // Verify Parent Book Counters
    const parentBookAfterLost = await dataManager.prisma.book.findUnique({
      where: { id: book1.id },
    });
    // total = 4 (all 4 copies are non-WITHDRAWN), available = 3 (copies[1], copies[2], copies[3] are AVAILABLE)
    assert(
      parentBookAfterLost?.totalCopies === 4,
      'Parent book totalCopies remains 4 (includes LOST copy as institutional asset)',
      `Expected 4, got ${parentBookAfterLost?.totalCopies}`
    );
    assert(
      parentBookAfterLost?.availableCopies === 3,
      'Parent book availableCopies is 3 (excludes LOST copy)',
      `Expected 3, got ${parentBookAfterLost?.availableCopies}`
    );

    // ---------------------------------------------------------
    // 5. Active Loan Settle as DAMAGED
    // ---------------------------------------------------------
    // Issue copy 1 to studentB
    const lending2 = await dataManager.createLending({
      userId: studentB.id,
      bookCopyId: copies[1].id,
      status: 'ISSUED',
    });
    await dataManager.prisma.book.update({
      where: { id: book1.id },
      data: { availableCopies: 2 },
    });

    const damagedNotes = 'Water spill damaged pages 15 to 45.';
    const settleDamagedRes = await librarianClient.request('POST', `/api/lending/return/${lending2.id}`, {
      body: {
        resolution: 'DAMAGED',
        condition: 'Poor',
        notes: damagedNotes,
      },
    });
    assert(
      settleDamagedRes.status === 200,
      'Librarian successfully settles active loan as DAMAGED with HTTP 200',
      `Got status ${settleDamagedRes.status}: ${settleDamagedRes.body?.error}`
    );
    assert(
      settleDamagedRes.body?.fine === 0,
      'Settled DAMAGED loan has fine strictly equal to 0 in API response',
      `Expected fine 0, got ${settleDamagedRes.body?.fine}`
    );
    assert(
      settleDamagedRes.body?.copyStatus === 'DAMAGED',
      'API response indicates copyStatus is DAMAGED',
      `Expected DAMAGED, got ${settleDamagedRes.body?.copyStatus}`
    );

    // Verify Database State for DAMAGED loan & copy
    const dbDamagedLending = await dataManager.prisma.lending.findUnique({
      where: { id: lending2.id },
      include: { bookCopy: true },
    });
    assert(dbDamagedLending?.status === 'RETURNED', 'DAMAGED loan status is updated to RETURNED');
    assert(dbDamagedLending?.returnedDate !== null, 'DAMAGED loan returnedDate is populated');
    assert(dbDamagedLending?.fine === 0, 'DAMAGED loan fine in database is strictly 0');
    assert(dbDamagedLending?.notes === damagedNotes, 'DAMAGED loan notes are saved in database');
    assert(dbDamagedLending?.bookCopy?.status === 'DAMAGED', 'Physical BookCopy status is set to DAMAGED');
    assert(dbDamagedLending?.bookCopy?.condition === 'Poor', 'Physical BookCopy condition updated to Poor');

    // Verify Notification to Borrower
    const damagedNotification = await dataManager.prisma.notification.findFirst({
      where: {
        userId: studentB.id,
        title: 'Book Returned Damaged',
      },
      orderBy: { createdAt: 'desc' },
    });
    assert(Boolean(damagedNotification), 'Borrower received "Book Returned Damaged" notification');
    assert(
      damagedNotification?.message?.includes('Under college policy, no monetary fines are assessed.'),
      'Notification message explicitly states zero-fine college policy: "Under college policy, no monetary fines are assessed."',
      `Got message: ${damagedNotification?.message}`
    );

    // Verify Audit Log for DAMAGED settlement
    const damagedAuditLog = await dataManager.prisma.auditLog.findFirst({
      where: {
        targetId: copies[1].id,
        action: 'BOOK_COPY_DAMAGED',
      },
      orderBy: { timestamp: 'desc' },
    });
    assert(Boolean(damagedAuditLog), 'Transactional audit log with action BOOK_COPY_DAMAGED was recorded');

    // Verify Parent Book Counters
    const parentBookAfterDamaged = await dataManager.prisma.book.findUnique({
      where: { id: book1.id },
    });
    // total = 4 (all 4 non-WITHDRAWN), available = 2 (copies[2], copies[3] are AVAILABLE)
    assert(
      parentBookAfterDamaged?.totalCopies === 4,
      'Parent book totalCopies remains 4 (includes DAMAGED copy)',
      `Expected 4, got ${parentBookAfterDamaged?.totalCopies}`
    );
    assert(
      parentBookAfterDamaged?.availableCopies === 2,
      'Parent book availableCopies is 2 (excludes DAMAGED copy)',
      `Expected 2, got ${parentBookAfterDamaged?.availableCopies}`
    );

    // ---------------------------------------------------------
    // 6. Normal Return Workflow Intact
    // ---------------------------------------------------------
    // Issue copy 2 to teacher
    const lending3 = await dataManager.createLending({
      userId: teacher.id,
      bookCopyId: copies[2].id,
      status: 'ISSUED',
    });
    await dataManager.prisma.book.update({
      where: { id: book1.id },
      data: { availableCopies: 1 },
    });

    const normalReturnRes = await librarianClient.request('POST', `/api/lending/return/${lending3.id}`, {
      body: {
        resolution: 'RETURNED',
      },
    });
    assert(
      normalReturnRes.status === 200,
      'Normal return completes successfully with HTTP 200',
      `Got status ${normalReturnRes.status}`
    );
    assert(
      normalReturnRes.body?.fine === 0,
      'Normal return has fine strictly equal to 0',
      `Expected fine 0, got ${normalReturnRes.body?.fine}`
    );
    assert(
      normalReturnRes.body?.copyStatus === 'AVAILABLE',
      'Normal return sets copyStatus to AVAILABLE',
      `Expected AVAILABLE, got ${normalReturnRes.body?.copyStatus}`
    );

    const dbNormalLending = await dataManager.prisma.lending.findUnique({
      where: { id: lending3.id },
      include: { bookCopy: true },
    });
    assert(dbNormalLending?.status === 'RETURNED', 'Normal return loan status is RETURNED');
    assert(dbNormalLending?.bookCopy?.status === 'AVAILABLE', 'Normal return BookCopy is AVAILABLE');

    // Verify audit log
    const returnAuditLog = await dataManager.prisma.auditLog.findFirst({
      where: {
        targetId: lending3.id,
        action: 'LENDING_RETURNED',
      },
      orderBy: { timestamp: 'desc' },
    });
    assert(Boolean(returnAuditLog), 'Normal return emits LENDING_RETURNED audit log');

    // Parent book available copies restored to 2
    const parentBookAfterNormal = await dataManager.prisma.book.findUnique({
      where: { id: book1.id },
    });
    assert(
      parentBookAfterNormal?.availableCopies === 2,
      'Parent book availableCopies is restored to 2 (copies[2] and copies[3] available)',
      `Expected 2, got ${parentBookAfterNormal?.availableCopies}`
    );

    // ---------------------------------------------------------
    // 7. Double Settlement / Conflict Protection (HTTP 409)
    // ---------------------------------------------------------
    const duplicateSettleRes = await librarianClient.request('POST', `/api/lending/return/${lending1.id}`, {
      body: { resolution: 'LOST' },
    });
    assert(
      duplicateSettleRes.status === 400 || duplicateSettleRes.status === 409,
      'Attempting to settle an already returned loan is rejected (HTTP 400/409)',
      `Got status ${duplicateSettleRes.status}: ${duplicateSettleRes.body?.error}`
    );

    // ---------------------------------------------------------
    // 8. Overdue Loan Settle with Zero-Fine Guarantee
    // ---------------------------------------------------------
    // Create an overdue loan for copy 3 (due 15 days ago)
    const overdueLending = await dataManager.createLending({
      userId: studentA.id,
      bookCopyId: copies[3].id,
      status: 'ISSUED',
      dueDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
    });
    await dataManager.prisma.book.update({
      where: { id: book1.id },
      data: { availableCopies: 1 },
    });

    const overdueSettleRes = await librarianClient.request('POST', `/api/lending/return/${overdueLending.id}`, {
      body: { resolution: 'LOST', notes: 'Reported lost 15 days overdue' },
    });
    assert(
      overdueSettleRes.status === 200,
      'Overdue loan can be settled as LOST with HTTP 200'
    );
    assert(
      overdueSettleRes.body?.fine === 0,
      'Overdue loan strictly incurs 0 fine under zero-fine policy (fine === 0)',
      `Expected fine 0, got ${overdueSettleRes.body?.fine}`
    );

    // ---------------------------------------------------------
    // 9. Unissued Inventory Copy Transitions via PUT /api/books/copies/:copyId
    // ---------------------------------------------------------
    const book2 = await dataManager.createBook({
      title: 'Unissued Copy Transition Book',
      totalCopies: 3,
      tag: 'ld2',
    });
    const book2Copies = await dataManager.prisma.bookCopy.findMany({
      where: { bookId: book2.id },
      orderBy: { copyNumber: 'asc' },
    });

    // A. Transition unissued copy 0 to LOST
    const unissuedLostRes = await librarianClient.request('PUT', `/api/books/copies/${book2Copies[0].id}`, {
      body: {
        status: 'LOST',
        notes: 'Missing during inventory stocktaking audit.',
      },
    });
    assert(
      unissuedLostRes.status === 200,
      'Librarian can transition unissued copy to LOST via PUT /copies/:copyId',
      `Got status ${unissuedLostRes.status}: ${unissuedLostRes.body?.error}`
    );
    assert(
      unissuedLostRes.body?.copy?.status === 'LOST',
      'Copy status is updated to LOST'
    );

    // Verify specific audit log BOOK_COPY_LOST
    const unissuedLostAudit = await dataManager.prisma.auditLog.findFirst({
      where: {
        targetId: book2Copies[0].id,
        action: 'BOOK_COPY_LOST',
      },
      orderBy: { timestamp: 'desc' },
    });
    assert(Boolean(unissuedLostAudit), 'Audit log BOOK_COPY_LOST recorded for unissued copy transition');

    // B. Transition unissued copy 1 to DAMAGED
    const unissuedDamagedRes = await librarianClient.request('PUT', `/api/books/copies/${book2Copies[1].id}`, {
      body: {
        status: 'DAMAGED',
        condition: 'Damaged',
        notes: 'Spine damage discovered on shelf.',
      },
    });
    assert(
      unissuedDamagedRes.status === 200,
      'Librarian can transition unissued copy to DAMAGED via PUT /copies/:copyId',
      `Got status ${unissuedDamagedRes.status}: ${unissuedDamagedRes.body?.error}`
    );
    assert(
      unissuedDamagedRes.body?.copy?.status === 'DAMAGED',
      'Copy status is updated to DAMAGED'
    );

    // Verify specific audit log BOOK_COPY_DAMAGED
    const unissuedDamagedAudit = await dataManager.prisma.auditLog.findFirst({
      where: {
        targetId: book2Copies[1].id,
        action: 'BOOK_COPY_DAMAGED',
      },
      orderBy: { timestamp: 'desc' },
    });
    assert(Boolean(unissuedDamagedAudit), 'Audit log BOOK_COPY_DAMAGED recorded for unissued copy transition');

    // Verify book2 counters: total=3, available=1
    const book2Db = await dataManager.prisma.book.findUnique({
      where: { id: book2.id },
    });
    assert(
      book2Db?.totalCopies === 3,
      'Book 2 totalCopies is 3',
      `Expected 3, got ${book2Db?.totalCopies}`
    );
    assert(
      book2Db?.availableCopies === 1,
      'Book 2 availableCopies is 1 (only copy 2 remains available)',
      `Expected 1, got ${book2Db?.availableCopies}`
    );

    // ---------------------------------------------------------
    // 10. Protection: Actively Issued Copy Cannot Be Updated via PUT /copies/:copyId
    // ---------------------------------------------------------
    // Issue copy 2 of book2
    const issuedCopy2Lending = await dataManager.createLending({
      userId: studentA.id,
      bookCopyId: book2Copies[2].id,
      status: 'ISSUED',
    });

    const directUpdateOnIssuedRes = await librarianClient.request('PUT', `/api/books/copies/${book2Copies[2].id}`, {
      body: {
        status: 'LOST',
      },
    });
    assert(
      directUpdateOnIssuedRes.status === 400,
      'Direct status update on an actively ISSUED copy is rejected with HTTP 400',
      `Got status ${directUpdateOnIssuedRes.status}: ${directUpdateOnIssuedRes.body?.error}`
    );
    assert(
      directUpdateOnIssuedRes.body?.error?.toLowerCase().includes('actively issued'),
      'Error message states actively issued copy must use the lending return workflow'
    );

    // ---------------------------------------------------------
    // 11. Phase 6C Reactivation Guards Verification
    // ---------------------------------------------------------
    // A. Cannot reactivate LOST copy to AVAILABLE without reactivate: true
    const invalidLostReactivateRes = await librarianClient.request('PUT', `/api/books/copies/${book2Copies[0].id}`, {
      body: {
        status: 'AVAILABLE',
      },
    });
    assert(
      invalidLostReactivateRes.status === 400,
      'Direct reactivation of LOST copy without reactivate flag is rejected with HTTP 400',
      `Got status ${invalidLostReactivateRes.status}`
    );

    // B. Cannot reactivate DAMAGED copy to AVAILABLE while condition is still Damaged
    const invalidDamagedReactivateRes = await librarianClient.request('PUT', `/api/books/copies/${book2Copies[1].id}`, {
      body: {
        status: 'AVAILABLE',
        reactivate: true,
        condition: 'Damaged',
      },
    });
    assert(
      invalidDamagedReactivateRes.status === 400,
      'Reactivation of DAMAGED copy while condition is "Damaged" is rejected with HTTP 400',
      `Got status ${invalidDamagedReactivateRes.status}`
    );

    // C. Valid reactivation with reactivate: true and restored condition
    const validDamagedReactivateRes = await librarianClient.request('PUT', `/api/books/copies/${book2Copies[1].id}`, {
      body: {
        status: 'AVAILABLE',
        reactivate: true,
        condition: 'Good',
        notes: 'Repaired and restored to circulation.',
      },
    });
    assert(
      validDamagedReactivateRes.status === 200,
      'Valid reactivation of DAMAGED copy with condition "Good" succeeds with HTTP 200'
    );
    assert(
      validDamagedReactivateRes.body?.copy?.status === 'AVAILABLE',
      'Copy status restored to AVAILABLE'
    );

    // ---------------------------------------------------------
    // 12. Security Audit: No Leaked Secrets
    // ---------------------------------------------------------
    const leaked1 = findLeakedSecrets(settleLostRes.body);
    const leaked2 = findLeakedSecrets(settleDamagedRes.body);
    const leaked3 = findLeakedSecrets(unissuedLostRes.body);
    const leaked4 = findLeakedSecrets(validDamagedReactivateRes.body);
    assert(
      leaked1.length === 0 && leaked2.length === 0 && leaked3.length === 0 && leaked4.length === 0,
      'Zero-Fine Lost & Damaged responses contain no leaked secrets or sensitive fields'
    );
  } finally {
    await dataManager.cleanup();
  }
}
